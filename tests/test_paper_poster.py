import json

import httpx
import pytest
from fastapi.testclient import TestClient

from posterlab.server import create_app


SOURCE = {
    'title': 'Comparing library catalogs',
    'pages': [{'page': 2, 'text': 'Two catalogs give different dates to the same printing.'},
              {'page': 8, 'text': 'We paired each entry by printer. Dates agreed for 57 of 80 records.'}],
    'candidates': [
        {'id': 'f7', 'kind': 'figure', 'page': 2, 'label': 'Figure 7', 'caption': 'Matching procedure.'},
        {'id': 't9', 'kind': 'table', 'page': 8, 'label': 'Table 9', 'caption': 'Observed catalog agreement.'},
    ],
}
CHOSEN = {'methodFigureId': 'f7', 'resultTableId': 't9',
          'reading': {'problem': {'text': '两份目录对同一印次的日期记载不同。', 'refs': ['p2s1']},
                      'method': {'text': '逐条按印刷者配对。', 'refs': ['p8s1']},
                      'result': {'text': '80 条记录中，57 条的日期相同。', 'refs': ['p8s1']}}}
DESIGN = {'title': '谁给同一本书记了不同的日期？', 'subtitle': '按印刷者逐项对照',
          'accent': 'teal', 'composition': 'results-first',
          'headings': {'problem': '两个日期', 'method': '按人配对', 'result': '日期吻合'},
          'caption': '欢迎做目录校勘的同行看看这一组对照。'}
HEADERS = {'Idempotency-Key': 'paper-flow-example'}


def app_with_outputs(tmp_path, outputs, calls):
    def reply(request):
        data = json.loads(request.content)
        calls.append(data['messages'])
        value = outputs[len(calls)-1]
        if isinstance(value, httpx.Response):
            return value
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(value)}, 'finish_reason': 'stop'}],
                                         'usage': {'prompt_tokens': 70, 'completion_tokens': 60}})
    return TestClient(create_app(tmp_path, api_key='test', transport=httpx.MockTransport(reply), serve_site=False))


def test_read_then_plan_uses_real_refs_and_keeps_editable_facts(tmp_path):
    calls = []
    with app_with_outputs(tmp_path, [CHOSEN, DESIGN], calls) as c:
        first = c.post('/api/outreach/paper-reading', json=SOURCE, headers=HEADERS)
        assert first.is_success
        result = first.json()
        assert result['reading']['result']['refs'] == [{'page': 8, 'quote': SOURCE['pages'][1]['text']}]
        assert (result['methodFigureId'], result['resultTableId']) == ('f7', 't9')
        assert c.post('/api/outreach/paper-reading', json=SOURCE, headers=HEADERS).json() == result
        assert c.post('/api/outreach/paper-reading', json={**SOURCE, 'title': 'Different'}, headers=HEADERS).status_code == 409
        data = {k: result[k] for k in ('reading', 'methodFigureId', 'resultTableId')}
        out = c.post('/api/outreach/paper-layout', json={'title': SOURCE['title'], **data}, headers=HEADERS).json()
        assert out['layout']['accent'] == 'teal' and out['layout']['composition'] == 'results-first'
        assert [block['text'] for block in out['layout']['blocks']] == [f['text'] for f in result['reading'].values()]
        assert c.post('/api/outreach/paper-layout', json={'title': SOURCE['title'], **data}, headers=HEADERS).json() == out
    assert len(calls) == 2 and 'passages' in json.loads(calls[0][1]['content'])


def test_wrong_asset_kinds_unknown_refs_and_unverified_numbers_are_not_exposed(tmp_path):
    broken = {**CHOSEN, 'methodFigureId': 'absent', 'resultTableId': 'f7',
              'reading': {**CHOSEN['reading'], 'result': {'text': '90 条一致。', 'refs': ['p8s1']},
                          'method': {'text': '按印刷者配对。', 'refs': ['fake']}}}
    with app_with_outputs(tmp_path, [broken, DESIGN], []) as c:
        result = c.post('/api/outreach/paper-reading', json=SOURCE, headers=HEADERS).json()
        assert result['methodFigureId'] is result['resultTableId'] is None
        assert all(result['reading'][k] == {'text': '', 'refs': []} for k in ('method','result'))
        out = c.post('/api/outreach/paper-layout', json={'title': SOURCE['title'], 'reading': result['reading']},
                     headers=HEADERS).json()['layout']
        assert out['composition'] == 'balanced' and [b['role'] for b in out['blocks']] == ['problem']


def test_large_nonconsecutive_pages_and_bounded_request(tmp_path):
    source = {**SOURCE, 'pages': [*SOURCE['pages'], *({'page': p, 'text': 'catalog ' * 1800} for p in range(15, 22))]}
    with app_with_outputs(tmp_path, [CHOSEN], []) as c:
        assert len(json.dumps(source)) > 64000
        assert c.post('/api/outreach/paper-reading', json=source, headers=HEADERS).is_success
        for invalid in ([*source['pages'], source['pages'][0]], [{'page': 4, 'text': ' '}], [{'page': 2, 'text': 'x'}]):
            assert c.post('/api/outreach/paper-reading', json={**SOURCE, 'pages': invalid}, headers=HEADERS).status_code == 422


@pytest.mark.parametrize('upstream', [httpx.Response(503), {'methodFigureId': None}])
def test_failed_stage_keeps_idempotency_and_reports_its_error(tmp_path, upstream):
    calls = []
    with app_with_outputs(tmp_path, [upstream], calls) as c:
        assert c.post('/api/outreach/paper-reading', json=SOURCE).status_code == 400
        assert c.post('/api/outreach/paper-reading', json=SOURCE, headers=HEADERS).status_code == 502
        assert c.post('/api/outreach/paper-reading', json=SOURCE, headers=HEADERS).status_code == 409
    assert len(calls) == 1


@pytest.mark.parametrize('source', [{'sections': {'abstract':'Two catalogs give different dates.'}},
                                   {'evidence':['Two catalogs give different dates.']}])
def test_publication_copy_uses_reading_on_both_input_paths(tmp_path, source):
    ref = {'page': 8, 'quote': SOURCE['pages'][1]['text']}
    reading = {k: {'text': '按印刷者配对。', 'refs':[ref]} for k in ('problem', 'method', 'result')}
    output = {'headline':'目录配对','red':'比对两套目录','moments':'把这份校勘交给同事。','x':['Compare the two catalogs.'],
              'wechat':'书上的两个日期','evidence_ids':{c:[1] for c in ('red','moments','x','wechat')}}
    calls = []
    with app_with_outputs(tmp_path, [output], calls) as c:
        res = c.post('/api/outreach/paper', json={'title':SOURCE['title'], **source, 'reading':reading}, headers=HEADERS)
        assert res.is_success
    assert json.loads(calls[0][1]['content'])['reading']==reading
    prompt = calls[0][0]['content']
    assert all(phrase in prompt for phrase in ('具体问题','实际用了什么办法','在什么条件下看到什么结果','末尾请一类有关的读者'))
    assert '不要四次按同一顺序' in prompt and '把副句遮住' in prompt

def test_reading_backed_moments_preserves_named_method_and_an_observed_result():
    from posterlab.outreach_strategy import publication_issues

    payload={'title':'AtlasCast: A catalog benchmark', 'reading':{'method':{'text':'我们构建 AtlasCast。'},
             'result':{'text':'在受测记录中，62.5% 的版本可以配对。'}}}
    assert 'moments' in publication_issues({'moments':'把这份校勘交给同事，欢迎来阅读。'}, payload)
    assert not publication_issues({'moments':'两个版本是否同本？我们的 AtlasCast 按印刷者配对，受测记录中有62.5%能对上。做目录的朋友欢迎来看看。'}, payload)

def test_unambiguous_process_figure_beats_an_example_overview_without_assuming_its_number(tmp_path):
    candidates = [
        {'id':'opening','kind':'figure','page':2,'label':'Figure 9','caption':'Figure 9: Overview. Left: a motivating example of conflicting dates.'},
        {'id':'schema','kind':'figure','page':8,'label':'Figure 4','caption':'Figure 4: Construction and validation pipeline. Entries are paired by printer.'},
    ]
    with app_with_outputs(tmp_path,[{**CHOSEN,'methodFigureId':'opening'}, {**CHOSEN,'methodFigureId':'opening'}],[]) as c:
        first=c.post('/api/outreach/paper-reading',json={**SOURCE,'candidates':candidates},headers=HEADERS).json()
        assert first['methodFigureId']=='schema' and 'methodFigure' in first['selectionNotes']
        ambiguous=[*candidates, {**candidates[1], 'id':'other', 'label':'Figure 12'}]
        second=c.post('/api/outreach/paper-reading',json={**SOURCE,'candidates':ambiguous},headers={'Idempotency-Key':'separate-flow-check'}).json()
        assert second['methodFigureId']=='opening' and 'selectionNotes' not in second
