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
