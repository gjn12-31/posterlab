"""Exercise the same API entry points used by the studio against a mock Paratera gateway."""
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from posterlab.gateway import StudioGateway
from posterlab.server import create_app
from test_chat import chat_result
from test_evaluation import vision_result
from test_generation import build, result, REQUEST
from test_outreach import CAMPAIGN, CAMPAIGN_RESULT, PAPER, PAPER_RESULT, completion
from test_server import PAYLOAD, response


def test_paratera_routing_and_real_image_review(tmp_path, monkeypatch):
    monkeypatch.setenv('POSTERLAB_PROVIDER', 'paratera')
    monkeypatch.setenv('PARATERA_BASE_URL', 'https://gateway.example/v1/')
    for role in ('chat', 'paper', 'campaign', 'design', 'vision'):
        monkeypatch.setenv(f'PARATERA_{role.upper()}_MODEL', 'demo-' + role)
    observed = []

    def handler(request):
        assert str(request.url) == 'https://gateway.example/v1/chat/completions'
        assert request.headers['Authorization'] == 'Bearer test-only'
        body = json.loads(request.content)
        assert 'reasoning_effort' not in body
        observed.append(body['model'])
        if body['model'] == 'demo-design':
            return result()
        if body['model'] == 'demo-vision':
            image = body['messages'][1]['content'][1]['image_url']['url']
            assert image.startswith('data:image/png;base64,')
            return vision_result()
        if '活动海报编辑' in body['messages'][0]['content']:
            return response()
        if body['model'] == 'demo-chat':
            return chat_result('reply')
        if body['model'] == 'demo-paper':
            return completion(PAPER_RESULT)
        return completion(CAMPAIGN_RESULT)

    with TestClient(build(tmp_path, monkeypatch, handler)) as client:
        status = client.get('/api/status').json()
        assert status['provider'] == 'Paratera'
        assert status['paper_model'] == 'demo-paper'
        assert 'test-only' not in json.dumps(status)
        catalog = client.get('/api/models').json()
        assert catalog['defaults']['review'] == 'demo-vision'
        assert 'step-' not in json.dumps(catalog)
        for i, (path, payload, role) in enumerate([
            ('assist', PAYLOAD, 'chat'),
            ('assist', {**PAYLOAD, 'workflow':'paper'}, 'paper'),
            ('outreach/paper', PAPER, 'paper'),
            ('outreach/campaign', CAMPAIGN, 'campaign'),
            ('chat', {'messages':[{'role':'user', 'content':'标题建议'}]}, 'chat'),
            ('generations', REQUEST, 'design'),
        ]):
            headers = {'Idempotency-Key': f'routing-paratera-{i}'}
            first = client.post('/api/'+path, json=payload, headers=headers)
            assert first.is_success, first.text
            assert first.json()['provider'] == 'Paratera' and first.json()['model'] == 'demo-' + role
            assert client.post('/api/'+path, json=payload, headers=headers).is_success
        design_id = first.json()['id']
        review = client.post('/api/evaluations', json={'generation_id':design_id},
                             headers={'Idempotency-Key':'routing-visual-review'})
        assert review.is_success, review.text
        assert client.get('/api/evaluations/' + review.json()['id']).json()['state'] == 'complete'
        assert observed == ['demo-chat', 'demo-paper','demo-paper','demo-campaign','demo-chat','demo-design','demo-vision']


def test_switching_provider_never_borrows_other_key(tmp_path, monkeypatch):
    monkeypatch.setenv('POSTERLAB_PROVIDER', 'paratera')
    monkeypatch.setenv('STEP_API_KEY', 'other-test-key')
    monkeypatch.delenv('PARATERA_API_KEY', raising=False)
    with TestClient(create_app(tmp_path, serve_site=False)) as client:
        assert client.get('/api/status').json()['ai'] is False
        assert client.post('/api/outreach/paper', json=PAPER).status_code == 503


def test_auto_selects_paratera_and_rejects_insecure_endpoint(monkeypatch):
    monkeypatch.delenv('POSTERLAB_PROVIDER', raising=False)
    monkeypatch.setenv('PARATERA_API_KEY', 'test-only')
    gateway = StudioGateway.configured()
    assert gateway.name == 'Paratera' and 'test-only' not in repr(gateway)
    monkeypatch.setenv('PARATERA_BASE_URL', 'http://gateway.example/v1')
    with pytest.raises(ValueError, match='HTTPS'):
        StudioGateway.configured()


def test_default_models_are_selected_per_workflow(monkeypatch):
    monkeypatch.setenv('POSTERLAB_PROVIDER', 'paratera')
    monkeypatch.setenv('PARATERA_CHAT_MODEL', 'custom-chat')
    for role in ('paper', 'campaign', 'design', 'vision'):
        monkeypatch.delenv(f'PARATERA_{role.upper()}_MODEL', raising=False)
    defaults = StudioGateway.configured().defaults
    assert defaults == {'chat': 'custom-chat', 'paper': 'Kimi-K3.1-Pro',
                        'campaign': 'DeepSeek-V4-Pro-0813', 'design': 'DeepSeek-V4-Pro-0813',
                        'review': 'Qwen3.7-Plus'}
