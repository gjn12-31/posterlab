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


def test_reviewed_sections_generate_four_drafts_in_one_call_without_sentence_ids(tmp_path):
    sections = {"abstract": "A numerical result.", "introduction": "What prior research found."}
    calls = []

    def handler(request):
        messages = json.loads(request.content)["messages"]
        calls.append(json.loads(messages[1]["content"]))
        draft = {k: v for k, v in PAPER_RESULT.items() if k != "evidence_ids"}
        return completion(draft)

    client = TestClient(create_app(tmp_path, api_key="test-key", transport=httpx.MockTransport(handler), serve_site=False))
    for _ in range(2):
        result = client.post("/api/outreach/paper", headers=HEADERS, json={"title": "Test", "sections": sections})
        assert result.status_code == 200 and result.json()["evidence_ids"] == {}
        assert all(result.json()[c] for c in CHANNELS)
    assert calls == [{"title": "Test", "byline": "", "sections": sections}]


def test_section_workflow_keeps_usable_platforms(tmp_path):
    request = {"title": "Park shade", "sections": {"abstract": "Four parks were studied."}}
    response = completion({"x": ["Short post."], "red": "中文笔记", "wechat": None})
    app = create_app(tmp_path, api_key="test", transport=httpx.MockTransport(lambda _: response), serve_site=False)
    with TestClient(app) as c:
        result = c.post("/api/outreach/paper", headers=HEADERS, json=request)
        assert result.status_code == 200 and result.json()["red"] == "中文笔记"
        assert result.json()["headline"] == "Park shade" and "wechat" not in result.json()


@pytest.mark.parametrize("sections", [False, True])
def test_publication_format_preserves_the_whole_comparison_and_its_sources(tmp_path, sections):
    lead = "在九项任务上，2.8B 超过 6.9B，表现接近 12B"
    body = "作者也观察到分布变化。"
    article = "## **对照里的 C#** ###\n\n保留 #1 和 C#。\n\n### 研究范围\n\n只在九项任务上比较。\n\n```python\n# preserve comment\n```"
    draft = {**PAPER_RESULT, "headline": "小模型如何多想一步？", "red": lead + "\n\n" + body, "wechat": article}
    payload = {"title": "PonderLM", **({"sections": {"abstract": lead}} if sections else {"evidence": [lead]})}
    requests = []

    def handler(request):
        messages = json.loads(request.content)["messages"]
        assert "最多20个字符" in messages[0]["content"]
        assert "公众号编辑器的纯文本" in messages[0]["content"]
        requests.append(json.loads(messages[1]["content"]))
        return completion(draft)

    with TestClient(create_app(tmp_path, api_key="test", transport=httpx.MockTransport(handler), serve_site=False)) as client:
        response = client.post("/api/outreach/paper", headers=HEADERS, json=payload)
    assert response.is_success, response.text
    result = response.json()
    assert len(requests) == 1 and lead in json.dumps(requests[0], ensure_ascii=False)
    assert result["red"] == "小模型如何多想一步？\n\n" + lead + "\n\n" + body
    assert result["wechat"] == article.replace("## **对照里的 C#** ###", "对照里的 C#").replace("### 研究范围", "研究范围")
    assert result["evidence_ids"] == ({} if sections else draft["evidence_ids"])
    assert (result["x"], result["moments"]) == (draft["x"], draft["moments"])


def test_individual_paper_rewrite_uses_the_same_publication_format(tmp_path):
    long_line = "PonderPythia-2.8B：在连续空间思量，超过 Pythia-6.9B"
    fields = {"title": long_line, "description": long_line + "\n\n方法有三步。"}
    app = create_app(tmp_path, api_key="test", transport=httpx.MockTransport(lambda _: completion({"fields": fields})), serve_site=False)
    request = {"brief": {"title": "PonderLM: Inference in continuous space"}, "locked": [],
               "theme": "paper", "titleScale": 1, "workflow": "paper", "paper_channel": "red", "instruction": "改写小红书笔记"}
    with TestClient(app) as client:
        response = client.post("/api/assist", headers=HEADERS, json=request)
    assert response.is_success, response.text
    assert response.json()["fields"]["description"] == "PonderLM\n\n" + fields["description"]


def test_direct_paper_requests_exclude_review_watermarks_and_preserve_scientific_numbers():
    from pydantic import ValidationError
    from posterlab.outreach import PaperRequest

    notice = 'CVPR 2027 Submission #702. CONFIDENTIAL REVIEW COPY. DO NOT DISTRIBUTE.'
    finding = 'We used Sensor013 and measured 1.3 ± 0.2 mm.'
    source = PaperRequest(title='Measured light', sections={'abstract': notice + '\n' + finding})
    assert source.sections.abstract == finding
    assert PaperRequest(title='Light', evidence=[notice + ' ' + finding]).evidence == [finding]
    with pytest.raises(ValidationError):
        PaperRequest(title='Light', sections={'abstract': notice})
    with pytest.raises(ValidationError):
        PaperRequest(title='Light', evidence=[notice, finding])
    context = 'We study the phrase “do not distribute”. CVPR 2027 submission rates were measured.'
    assert PaperRequest(title='Decisions', evidence=[context]).evidence == [context]


def test_optional_cover_copy_and_channel_specific_rewrite(tmp_path):
    calls = []

    def complete(request):
        system = json.loads(request.content)['messages'][0]['content']
        calls.append(system)
        if len(calls) == 1:
            return completion({**PAPER_RESULT, 'cover_line': '  一次有参照的测量  ', 'cover_title_en': 'Reading the shade',
                               'cover_line_en': 'x' * 201})
        return completion({'fields': {'description': 'Shade drew more walkers.'}})

    app = create_app(tmp_path, api_key='test', transport=httpx.MockTransport(complete), serve_site=False)
    with TestClient(app) as client:
        result = client.post('/api/outreach/paper', headers=HEADERS, json=PAPER)
        assert result.is_success
        assert result.json()['cover_line'] == '一次有参照的测量'
        assert result.json()['cover_title_en'] == 'Reading the shade' and 'cover_line_en' not in result.json()
        rewrite = client.post('/api/assist', headers=HEADERS, json={
            'brief': {'title': PAPER['title']}, 'locked': [], 'theme': 'paper', 'titleScale': 1,
            'workflow': 'paper', 'paper_channel': 'x', 'instruction': '改写首帖',
        })
        assert rewrite.is_success
        assert '英文帖子' in calls[1] and '公众号编辑器' not in calls[1]
