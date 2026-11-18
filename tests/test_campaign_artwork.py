import base64
from io import BytesIO
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from posterlab import campaign_artwork
from posterlab.server import create_app


def image_bytes():
    out = BytesIO()
    Image.new('RGB', (18, 12), 'blue').save(out, format='PNG')
    return out.getvalue()


@pytest.fixture
def make_client(tmp_path, monkeypatch):
    monkeypatch.setenv('POSTERLAB_PROVIDER', 'paratera')
    monkeypatch.delenv('PARATERA_IMAGE_MODEL', raising=False)
    monkeypatch.delenv('PARATERA_BASE_URL', raising=False)

    def create(handler, key='test-key'):
        app = create_app(tmp_path, api_key=key, transport=httpx.MockTransport(handler), serve_site=False)
        return TestClient(app)
    return create


BODY = {'title': 'Illuminated evening', 'description': 'A nighttime music festival.', 'edition': 'vinyl'}
HEADERS = {'Idempotency-Key': 'artwork-retry-001'}


def test_generation_cache_and_credential_free_cdn_retry(make_client, monkeypatch):
    posts, gets = [], []

    async def resolve(host):
        assert host == 'cdn.example.com'
        return '93.184.215.14'
    monkeypatch.setattr(campaign_artwork, '_public_address', resolve)

    def upstream(req):
        if req.method == 'POST':
            posts.append(req)
            assert str(req.url) == 'https://llmapi.paratera.com/v1/images/generations'
            assert req.headers['Authorization'] == 'Bearer test-key'
            assert json.loads(req.content)['model'] == 'Doubao-Seedream-4.5'
            return httpx.Response(200, json={'data': [{'url': 'https://cdn.example.com/p.png?signature=xyz'}]})
        gets.append(req)
        assert req.url.host == '93.184.215.14'
        assert req.headers['Host'] == 'cdn.example.com'
        assert req.extensions['sni_hostname'] == 'cdn.example.com'
        assert 'Authorization' not in req.headers
        assert req.url.params['signature'] == 'xyz'
        return httpx.Response(503) if len(gets) == 1 else httpx.Response(200, content=image_bytes())

    client = make_client(upstream)
    assert client.get('/api/status').json()['artwork_model'] == 'Doubao-Seedream-4.5'
    assert client.post('/api/outreach/artwork', json=BODY, headers=HEADERS).status_code == 502
    first = client.post('/api/outreach/artwork', json=BODY, headers=HEADERS)
    assert first.status_code == 200
    item = first.json()
    assert item['provider'] == 'Paratera' and item['model'] == 'Doubao-Seedream-4.5'
    mime, raw = item['data_url'].split(',', 1)
    assert mime == 'data:image/webp;base64'
    assert Image.open(BytesIO(base64.b64decode(raw))).size == (18, 12)
    assert client.post('/api/outreach/artwork', json=BODY, headers=HEADERS).json() == item
    assert client.post('/api/outreach/artwork', json={**BODY, 'edition': 'coffee'}, headers=HEADERS).status_code == 409
    assert (len(posts), len(gets)) == (1, 2)


def test_disabled_and_invalid_input_do_not_generate(make_client):
    client = make_client(lambda _: pytest.fail('unexpected API call'), key='')
    assert client.get('/api/status').json()['artwork_model'] == ''
    assert client.post('/api/outreach/artwork', json=BODY, headers=HEADERS).status_code == 503
    assert client.post('/api/outreach/artwork', json={**BODY, 'url': 'https://example.org'}).status_code == 422


def test_generated_images_cannot_fetch_local_addresses(make_client):
    def upstream(req):
        assert req.method == 'POST'
        return httpx.Response(200, json={'data': [{'url': 'https://127.0.0.1/private'}]})
    response = make_client(upstream).post('/api/outreach/artwork', json=BODY, headers=HEADERS)
    assert response.status_code == 502


def test_supports_embedded_image_response(make_client):
    raw = base64.b64encode(image_bytes()).decode()
    client = make_client(lambda _: httpx.Response(200, json={'data': [{'b64_json': raw}]}))
    response = client.post('/api/outreach/artwork', json=BODY, headers=HEADERS)
    assert response.status_code == 200 and response.json()['data_url'].startswith('data:image/webp;base64,')


def test_current_print_proof_review_is_grounded_in_pixels_and_cached(make_client):
    from test_evaluation import vision_result
    seen = []

    def upstream(req):
        seen.append(json.loads(req.content))
        return vision_result() if len(seen) == 1 else vision_result({'summary': '不完整的结果'})

    buf = BytesIO()
    Image.new('RGB', (360, 480), 'navy').save(buf, 'JPEG')
    jpeg = base64.b64encode(buf.getvalue()).decode()
    body = {'brief': {'title': '蓝晒工坊'}, 'format': 'portrait', 'jpeg': jpeg}
    client = make_client(upstream)
    route = '/api/outreach/campaign-review'
    reply = client.post(route, headers=HEADERS, json=body)
    assert reply.status_code == 200 and len(reply.json()['priorities']) == 2
    assert seen[0]['messages'][1]['content'][1]['image_url']['url'] == 'data:image/jpeg;base64,' + jpeg
    assert client.post(route, headers=HEADERS, json=body).json() == reply.json()
    assert len(seen) == 1
    assert client.post(route, headers=HEADERS, json={**body, 'format': 'square'}).status_code == 422
    bad = client.post(route, headers={'Idempotency-Key':'invalid-review'}, json=body)
    assert bad.status_code == 502 and 'priorities' not in bad.json()


def test_paper_artwork_uses_its_own_prompt_and_cache(make_client):
    calls = []
    encoded = base64.b64encode(image_bytes()).decode()

    def upstream(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json={'data': [{'b64_json': encoded}]})

    client = make_client(upstream)
    body = {'title': 'Measuring shade', 'abstract': 'Two parks were observed.'}
    art = client.post('/api/outreach/paper-artwork', json=body, headers=HEADERS)
    assert art.status_code == 200 and art.json()['data_url'].startswith('data:image/webp;base64,')
    assert client.post('/api/outreach/paper-artwork', json=body, headers=HEADERS).json() == art.json()
    assert 'Two parks were observed.' in calls[0]['prompt']
    assert 'original published figure' in calls[0]['prompt']
    # Same caller token is independent between a paper and an event.
    assert client.post('/api/outreach/artwork', json=BODY, headers=HEADERS).status_code == 200
    assert len(calls) == 2 and calls[0]['prompt'] != calls[1]['prompt']
    assert client.post('/api/outreach/paper-artwork', json={**body, 'abstract':''}, headers=HEADERS).status_code == 422
