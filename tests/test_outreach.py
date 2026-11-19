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


def test_paper_voices_change_the_kit_and_one_channel_brief(tmp_path):
    prompts = []

    def handler(request):
        prompt = json.loads(request.content)['messages'][0]['content']
        prompts.append(prompt)
        return completion({'fields': {'description': '推荐给做公园设计的同行。'}} if '改写任务' in prompt else PAPER_RESULT)

    with TestClient(create_app(tmp_path, api_key='test', transport=httpx.MockTransport(handler), serve_site=False)) as client:
        assert client.post('/api/outreach/paper', headers=HEADERS, json=PAPER).is_success
        assert '发布身份：论文作者' in prompts[0]
        assert client.post('/api/outreach/paper', headers=HEADERS, json={**PAPER, 'voice':'editor'}).status_code == 409
        second = client.post('/api/outreach/paper', headers={'Idempotency-Key':'editor-kit-test'}, json={**PAPER,'voice':'editor'})
        assert second.is_success and '发布身份：第三方编辑' in prompts[-1]
        ask = {'brief':{'title':'Park shade'}, 'locked':[], 'theme':'paper', 'titleScale':1, 'workflow':'paper',
               'paper_channel':'red', 'paper_voice':'editor', 'instruction':'请改写这篇小红书发布稿。'}
        assert client.post('/api/assist', headers=HEADERS, json=ask).is_success
        assert '发布身份：第三方编辑' in prompts[-1] and '公众号编辑器' not in prompts[-1]


@pytest.mark.parametrize('repair', ['valid', 'still_summary', 'outage', 'no_budget'])
def test_summary_rewrite_is_partial_cached_and_preserves_the_first_draft(tmp_path, repair):
    calls = []
    source = {'title':'Park shade','voice':'author','sections':{'abstract':'Four parks showed higher summer footfall on shaded paths.', 'introduction':''}}
    original = {**PAPER_RESULT, 'moments':'本研究提出了一种路径计数方法。实验结果表明阴凉路段行人更多。'}
    replacement = '把我们在四座公园数到的一个细节分享给做步道设计的朋友：夏季阴凉路段的人更多。'

    def upstream(request):
        payload = json.loads(request.content)['messages']
        calls.append(json.loads(payload[1]['content']))
        if len(calls) == 1:
            return completion(original)
        if repair == 'outage':
            return httpx.Response(503)
        return completion({'moments': replacement if repair == 'valid' else original['moments'], 'x':['unrequested']})

    app = create_app(tmp_path, api_key='test', budget=.1 if repair == 'no_budget' else 5,
                     transport=httpx.MockTransport(upstream), serve_site=False)
    with TestClient(app) as client:
        first = client.post('/api/outreach/paper', headers=HEADERS, json=source)
        assert first.is_success
        result = first.json()
        assert client.post('/api/outreach/paper', headers=HEADERS, json=source).json() == result
    assert len(calls) == (1 if repair == 'no_budget' else 2)
    if len(calls) == 2:
        assert list(calls[1]['drafts']) == ['moments'] and calls[1]['source']['sections'] == source['sections']
    assert result['publication_check'] == {'channels':['moments'], 'revised':['moments'] if repair == 'valid' else [],
                                           'status':'revised' if repair == 'valid' else 'kept', 'model_calls':len(calls)}
    assert result['moments'] == (replacement if repair == 'valid' else original['moments'])
    assert all(result[channel] == original[channel] for channel in ('x','red','wechat'))


def test_respects_research_ownership_and_flags_verbatim_abstract_lead():
    from posterlab.outreach_strategy import publication_issues

    sentence = 'We built an interactive archive where readers can compare summer foot traffic measured by the same four observation counters.'
    payload = {'voice':'author','sections':{'abstract':sentence}}
    assert publication_issues({'x':[sentence]},payload).keys() == {'x'}
    assert not publication_issues({'x':['We built a map of the counts.'],'moments':'把这张夏日步道图分享给同事。'},payload)
    assert publication_issues({'moments':'我们测量了四个路口。'}, {**payload,'voice':'editor'}).keys() == {'moments'}


def test_launch_wrappers_and_outline_headings_do_not_hide_summaries():
    from posterlab.outreach_strategy import publication_issues

    drafts = {
        'x': ['🎉 New preprint! This paper presents an archive of street shade.'],
        'red': '夏天树影有什么不同？\n\n新论文来了！本研究探讨了四座公园里的树冠分布。',
        'wechat': '从路口看树影\n\n研究背景\n树影会变。\n研究方法：比对同一路口的图。',
        'moments': '新论文来了！想知道你家路口下午哪边更晒，可以先对着这两张图找找方向。',
    }
    assert set(publication_issues(drafts, PAPER)) == {'x', 'red', 'wechat'}


def test_clipboard_ready_voice_hides_editorial_instructions_and_verbatim_chinese():
    from posterlab.outreach_strategy import publication_issues

    excerpt = '四座公园的夏季观测覆盖上午和下午的同一路段并记录了每一次观测中行人的路径选择'
    drafts = {'red': '哪边更晒？\n\n' + excerpt + '。', 'wechat': '哪条路适合步行？\n\n论文给一个有凭据的路线选择判断。'}
    assert set(publication_issues(drafts, {'evidence': [excerpt]})) == {'red', 'wechat'}


def test_targeted_rewrite_can_see_the_shared_opening_but_keeps_shared_scientific_facts():
    from posterlab.outreach_strategy import publication_issues, revision_messages

    opener = '想和大家分享这张四季树影图，在图上可以找出下午适合步行的那一边'
    same_fact = '四座公园都在夏季和冬季各采集了同一路段早晨和下午的树冠阴影照片'
    drafts = {'red': '冬夏怎么看树影\n\n' + opener + '。' + same_fact + '。', 'moments': opener + '。',
              'wechat': '树影图的两种读法\n\n' + same_fact + '。两次记录先按路口对应，再比方向。'}
    issues = publication_issues(drafts, PAPER)
    assert set(issues) == {'moments'}
    user = json.loads(revision_messages(PAPER, drafts, issues)[1]['content'])
    assert user['existing_openings']['red'].startswith(opener) and list(user['drafts']) == ['moments']
    drafts['moments'] = same_fact + '。可以留给下周带同学走这条路的老师。'
    assert not publication_issues(drafts, PAPER)


def test_lightly_reworded_paragraphs_still_trigger_a_channel_rewrite():
    from posterlab.outreach_strategy import publication_issues

    first = '同一张城市步道图里，早晚经过同一路口会看见两种树影。'
    second = '我们把这个路口的两次读数放在一起看，先找影子落在哪边。'
    drafts = {'red': '路口的两面\n\n' + first + second,
              'wechat': '影子在哪边\n\n' + first.replace('看见', '看到') + second.replace('先找', '再找')}
    assert set(publication_issues(drafts, PAPER)) == {'wechat'}
    drafts['wechat'] = '谁在用这张图\n\n' + first + '画步行路线的同事可以按路段选适合的时段。'
    assert not publication_issues(drafts, PAPER)


def test_source_backed_thread_finishes_with_a_reader_invitation():
    from posterlab.outreach_strategy import publication_issues

    payload = {**PAPER, 'reading': {'method': {'text': 'Two maps of the same routes.'}}}
    thread = ['Where did the shade go?', 'We checked the same park routes at midday.']
    assert set(publication_issues({'x': thread}, payload)) == {'x'}
    for end in ('Trail planners, compare the two routes on our map.', 'Which route would you check first?'):
        assert not publication_issues({'x': [thread[0], end]}, payload)


def test_chinese_channels_close_with_a_relevant_invitation():
    from posterlab.outreach_strategy import publication_issues

    payload = {**PAPER, 'reading': {'method': {'text': 'Map reading.'}}}
    story = '我们想知道夏天下午走哪边更凉快，就把同一路口的两张树影图放在了一起。'
    for channel in ('red', 'moments', 'wechat'):
        assert channel in publication_issues({channel: story + '步道规划者值得把遮阴纳入考虑。'}, payload)
        for close in ('做路线设计的朋友，可以对照看看图上的路口。', '规划散步路线时，你会先选图上哪一边？'):
            assert not publication_issues({channel: story + close + '\n#步行地图'}, payload)


def test_review_of_an_earlier_channel_cannot_duplicate_a_later_channels_opening(tmp_path):
    opening = '我们把城市步道树影图分享给正在准备夏季路线的朋友，看看哪一边适合下午经过。'
    old = {**PAPER_RESULT, 'red': '路口写生\n\n本文提出了一种记录步道树冠的方法。', 'wechat': '下午走哪边\n\n' + opening}
    calls = []
    def upstream(request):
        calls.append(request)
        return completion(old if len(calls) == 1 else {'red': '夏天从哪边走\n\n' + opening})
    with TestClient(create_app(tmp_path, api_key='test', transport=httpx.MockTransport(upstream), serve_site=False)) as client:
        result = client.post('/api/outreach/paper', headers=HEADERS, json={'title':'Park shade','sections':{'abstract':'We recorded park shade in summer.'}}).json()
    assert len(calls) == 2
    assert result['red'] == old['red'] and result['publication_check']['status'] == 'kept'


def test_unverified_resource_links_are_removed_even_when_the_revision_fails(tmp_path):
    actual = 'https://github.com/fieldnotebook/shade'
    fabricated = 'https://example.org/demo'
    source = {'title':'Park shade','sections':{'abstract':'We release our code at ' + actual + '.'}}
    original = {**PAPER_RESULT, 'red':'看步道阴影\n\n代码：' + actual,
                'x':['Compare the two paths. See the counts in our paper. Code: ' + fabricated],
                'wechat':'看看街道两侧。\n\n[演示](' + fabricated + ')'}
    calls = []

    def handler(request):
        calls.append(json.loads(request.content)['messages'])
        return completion(original) if len(calls)==1 else httpx.Response(503)

    with TestClient(create_app(tmp_path, api_key='test', transport=httpx.MockTransport(handler), serve_site=False)) as c:
        out = c.post('/api/outreach/paper', json=source, headers=HEADERS).json()
        assert len(calls)==2 and out['publication_check']['status']=='kept'
        assert out['x']==['Compare the two paths. See the counts in our paper.']
        assert out['wechat']=='看看街道两侧。' and out['red']==original['red']
        assert fabricated not in json.dumps(out,ensure_ascii=False)


def test_number_piling_gets_targeted_but_a_single_conditioned_comparison_is_preserved():
    from posterlab.outreach_strategy import publication_issues
    payload={'voice':'author', 'sections':{'abstract':'We test an update rule.'}}
    two={'x':['Meet the update rule.', 'Against the same baseline, trainable parameters fell 10,000× and memory 3×.']}
    assert list(publication_issues(two,payload))==['x']
    single={'x':['Meet the update rule.', 'Against the same baseline, trainable parameters fell 10,000×.']}
    assert not publication_issues(single,payload)


def test_thread_dropping_a_measurements_table_behind_a_hook_is_revised():
    from posterlab.outreach_strategy import publication_issues

    signal = 'In two detectors the frequency rose from 35 to 250 Hz, with peak strain near 1 × 10⁻²¹.'
    draft = {'x': [signal, 'The matched-filter SNR was 24. The false-alarm rate was below 1 event per 203,000 years.'],
             'red': '探测器里的一条弧线\n\n频率从35升至250 Hz，峰值应变约为1 × 10⁻²¹。匹配滤波信噪比为24。',
             'wechat': '环有多大？\n\n在1.3 mm波长处，亮环角直径约42 ± 3微角秒。另一组测量得到41 ± 2微角秒。'}
    assert set(publication_issues(draft, PAPER)) == {'red', 'x'}
    assert not publication_issues({'x': [signal]}, PAPER)


def test_single_channel_rewrite_keeps_only_resource_url_in_the_supplied_material(tmp_path):
    github = 'https://github.com/fieldnotebook/shade'
    fields = {'description': '看看树冠下的步道。\n代码：' + github + '\n演示：https://example.org/not-released'}
    app = create_app(tmp_path, api_key='test', transport=httpx.MockTransport(lambda _: completion({'fields':fields})), serve_site=False)
    ask = {'brief':{'title':'Shade'},'locked':[],'theme':'paper','titleScale':1,'workflow':'paper','paper_channel':'moments',
           'paper_voice':'author','instruction':'改稿。\n' + json.dumps({'sections':{'abstract':'We release our code at ' + github + '.'}})}
    with TestClient(app) as c:
        out = c.post('/api/assist', json=ask, headers=HEADERS)
        assert out.is_success and out.json()['fields']['description'] == '看看树冠下的步道。\n代码：' + github


def test_long_paper_rewrite_uses_the_same_copy_limit_as_an_initial_kit(tmp_path):
    article = '这幅树影图怎样读？\n\n' + '我们按时段核对了树影落在道路哪边。' * 84
    assert 1200 < len(article) < 4000
    app = create_app(tmp_path, api_key='test', serve_site=False,
                     transport=httpx.MockTransport(lambda _: completion({'fields': {'description': article}})))
    req = {'brief': {'title': 'Shade'}, 'theme': 'paper', 'titleScale': 1, 'locked': [], 'instruction': '写成一篇完整稿。'}
    with TestClient(app) as client:
        paper = client.post('/api/assist', headers=HEADERS, json={**req, 'workflow': 'paper', 'paper_channel': 'wechat'})
        assert paper.is_success and paper.json()['fields']['description'] == article
        event = client.post('/api/assist', headers={'Idempotency-Key':'event-description-length'}, json=req)
        assert not event.is_success


def test_full_research_note_can_explain_separate_measurements_between_paragraphs():
    from posterlab.outreach_strategy import publication_issues
    body = ('先在同一台仪器读出频率为24Hz。\n\n为什么换成另一种观察？短窗口会遮住两次出现的间隔。'
            '\n\n我们在第二轮比较中固定采样条件，信噪比为12。\n\n'
            '这还不能回答另一个问题，所以我们另算了假阳性，在单独测试中误报率为2%。')
    assert not publication_issues({'wechat': '一组读数怎样变成两组问题\n\n' + body}, PAPER)


def test_author_note_brief_reaches_first_draft_manual_edit_and_editorial_revision():
    from posterlab.outreach_strategy import build_messages, paper_edit_system, revision_messages
    drafts = {**PAPER_RESULT, 'red': '一篇旧稿'}
    prompts = (build_messages('paper', PAPER)[0]['content'], paper_edit_system('red'),
               revision_messages(PAPER, drafts, {'red': '请重写技术直觉。'})[0]['content'])
    for prompt in prompts:
        assert '研究手记型' in prompt and '基准发布型' in prompt
        assert '完整原创虚构小样' in prompt and '论文作者 / 团队' in prompt
        assert '没有帖图顺序不要写' in prompt
