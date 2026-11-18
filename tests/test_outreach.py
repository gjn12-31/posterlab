import json

import httpx
import pytest
from fastapi.testclient import TestClient

from posterlab.server import create_app

PAPER = {"title": "Park shade", "evidence": ["Four parks were observed in summer."]}
CHANNELS = ("x", "red", "moments", "wechat")
PAPER_RESULT = {
    "headline": "夏日公园观察", "x": ["Four parks were observed."], "red": "夏日笔记",
    "moments": "夏日观察", "wechat": "一项公园观察", "evidence_ids": {c: [1] for c in CHANNELS},
}
CAMPAIGN = {"brief": {"title": "街区咖啡日", "venue": "青石广场"}}
CAMPAIGN_RESULT = {"invitation": "来广场聊聊手冲。", "edition": "coffee", "tag": "COFFEE DAY", "reason": "适合咖啡市集。"}
HEADERS = {"Idempotency-Key": "outreach-example-001"}


def completion(data):
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(data)}, "finish_reason": "stop"}],
                                     "usage": {"prompt_tokens": 80, "completion_tokens": 60}})


@pytest.mark.parametrize("kind,payload,draft", [("paper", PAPER, PAPER_RESULT), ("campaign", CAMPAIGN, CAMPAIGN_RESULT)])
def test_real_provider_contract_and_idempotency(tmp_path, kind, payload, draft):
    calls = []

    def handler(request):
        assert str(request.url) == "https://api.stepfun.com/v1/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-key"
        data = json.loads(request.content)
        assert data["response_format"]["type"] == "json_object"
        system, user = data["messages"]
        assert system["role"] == "system" and user["role"] == "user"
        source = json.loads(user["content"])
        if kind == "paper":
            assert source["evidence"] == [{"id": 1, "quote": PAPER["evidence"][0]}]
        else:
            assert source["brief"]["venue"] == CAMPAIGN["brief"]["venue"]
        calls.append(data["model"])
        return completion(draft)

    app = create_app(tmp_path, api_key="test-key", transport=httpx.MockTransport(handler), serve_site=False)
    with TestClient(app) as client:
        for _ in range(2):
            response = client.post("/api/outreach/" + kind, headers=HEADERS, json=payload)
            assert response.status_code == 200
            assert response.json() == {**draft, "provider": "StepFun", "model": calls[0]}
        assert len(calls) == 1
        assert client.get("/api/status").json()["spent"] > 0


@pytest.mark.parametrize("provider_response", [
    completion({**PAPER_RESULT, "evidence_ids": {c: [2] for c in CHANNELS}}),
    completion({**PAPER_RESULT, "evidence_ids": {"x": [1]}}), httpx.Response(503),
])
def test_unusable_upstream_result_preserves_caller_input(tmp_path, provider_response):
    transport = httpx.MockTransport(lambda _: provider_response)
    with TestClient(create_app(tmp_path, api_key="test-key", transport=transport, serve_site=False)) as client:
        assert client.post("/api/outreach/paper", headers=HEADERS, json=PAPER).status_code == 502


def test_unconfigured_outreach(tmp_path):
    with TestClient(create_app(tmp_path, api_key="", serve_site=False)) as client:
        assert client.post("/api/outreach/paper", headers=HEADERS, json=PAPER).status_code == 503
