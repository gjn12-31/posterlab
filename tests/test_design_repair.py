import json
from pathlib import Path
import httpx
import pytest
from bs4 import BeautifulSoup
from fastapi.testclient import TestClient
from posterlab.generation import facts_from_brief, validate_generated, render_document
from posterlab.design_repair import normalize_design
from test_generation import HTML, BRIEF, REQUEST, HEADERS, build, result, fake_render


def test_visible_fields_win_over_hidden_duplicates_and_labels(tmp_path):
    brief='活动主题：设计开放日\n举办日期：2026-11-08\n举办地点：城市艺术中心'
    html=HTML.replace(' data-field="title"','').replace('data-field="venue"','data-field="location"')
    html=html.replace('>2026-11-08</p>','><small>DATE</small>2026-11-08</p>')
    html=html.replace('</main>','<div class="hidden"><p data-field="date">2026-11-08</p><p data-field="location">城市艺术中心</p></div></main>')
    html=html.replace('</style>', '.hidden{visibility:hidden;height:0;overflow:hidden}.texture{background-image:url("data:image/svg+xml,noise")}svg{fill:url(#ink)}</style>')
    repaired,changes=normalize_design(html,facts_from_brief(brief))
    validate_generated(repaired,brief)
    soup=BeautifulSoup(repaired,'html.parser')
    assert soup.select_one('[data-field="date"]').text=='2026-11-08'
    assert not soup.select('.hidden [data-field]')
    assert 'url(#ink)' in repaired and 'data:image' not in repaired
    assert len(changes)>=4
    report=render_document(repaired,1080,1440,tmp_path/'real.png',Path(__file__).resolve().parents[1]/'web/public/fonts')
    assert {f['field'] for f in report['fields']}=={'title','date','venue'}


@pytest.mark.parametrize('css',[
    '@import "https://example.com/font.css";@font-face{font-family:X;src:url(font.woff)}',
    '.art{background:linear-gradient(red,blue),url(https://example.com/a);color:red}',
    '@media (min-width:1px){.art{background:u\\72l("https://example.com/a");color:red}}',
])
def test_resource_cleanup_preserves_safe_design_and_still_validates(css):
    repaired,changes=normalize_design(HTML.replace('</style>',css+'</style>'),facts_from_brief(BRIEF))
    assert changes and 'example.com' not in repaired
    validate_generated(repaired,BRIEF)


def test_active_code_is_never_silently_accepted():
    repaired,_=normalize_design(HTML.replace('</head>','<script>alert(1)</script></head>'),facts_from_brief(BRIEF))
    with pytest.raises(ValueError,match='script'):validate_generated(repaired,BRIEF)


def test_invalid_response_is_repaired_by_same_model_with_diagnostics_and_ledger(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        calls.append(json.loads(req.content))
        return result('<!doctype html><html>broken') if len(calls)==1 else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        job=c.get('/api/generations/'+id).json()
        assert job['state']=='complete' and job['repair_attempt']==1
        assert len(calls)==2 and calls[0]['model']==calls[1]['model']
        assert all('max_tokens' not in call for call in calls)
        assert '缺少完整 HTML' in calls[1]['messages'][-1]['content']
        assert job['usage']['prompt_tokens']==2400
        assert job['cost']==pytest.approx(sum(a['cost'] for a in job['attempts']))
        assert (tmp_path/'generations'/id/'attempt-1-response.json').exists()
        c.post('/api/generations',json=REQUEST,headers=HEADERS)
        assert len(calls)==2
        assert c.get('/api/status').json()['reserved']==0


def test_repair_is_bounded_and_explicit_retry_preserves_failure(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        calls.append(req)
        return result(HTML.replace('</head>','<script>bad</script></head>')) if len(calls)<=3 else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        job=c.get('/api/generations/'+original).json()
        assert job['state']=='failed' and len(calls)==3
        assert c.get('/api/generations/'+original+'/image').status_code==409
        headers={'Idempotency-Key':'explicit-retry-0001'}
        retry=c.post('/api/generations/'+original+'/retry',json={},headers=headers).json()
        assert retry['id']!=original
        assert c.get('/api/generations/'+retry['id']).json()['state']=='complete'
        assert c.get('/api/generations/'+original).json()['state']=='failed'
        assert c.post('/api/generations/'+original+'/retry',json={},headers=headers).json()['id']==retry['id']
        assert len(calls)==4


def test_timeout_during_repair_does_not_repeat_uncertain_call(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        calls.append(req)
        if len(calls)==1:return result('broken')
        raise httpx.ReadTimeout('timeout',request=req)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        job=c.get('/api/generations/'+id).json()
        assert job['state']=='failed' and '远端状态未知' in job['error']
        assert len(calls)==2 and c.get('/api/status').json()['reserved']==.1


def test_transient_browser_crash_retries_locally_without_api(tmp_path,monkeypatch):
    calls=[];renders=[]
    def handler(req):calls.append(req);return result()
    def renderer(*args):
        renders.append(1)
        if len(renders)==1:raise RuntimeError('Browser closed')
        return fake_render(*args)
    with TestClient(build(tmp_path,monkeypatch,handler,renderer=renderer)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        assert c.get('/api/generations/'+id).json()['state']=='complete'
        assert len(calls)==1 and len(renders)==2


def test_layout_failure_sent_back_to_model(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(json.loads(req.content));return result()
    renders=[]
    def renderer(*args):
        renders.append(1)
        if len(renders)==1:raise ValueError('title与date文字重叠')
        return fake_render(*args)
    with TestClient(build(tmp_path,monkeypatch,handler,renderer=renderer)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        assert c.get('/api/generations/'+id).json()['state']=='complete'
        assert 'title与date文字重叠' in calls[1]['messages'][-1]['content']


def test_no_success_without_png(tmp_path,monkeypatch):
    def no_picture(*args):return {'width':1080,'height':1440}
    with TestClient(build(tmp_path,monkeypatch,lambda req:result(),renderer=no_picture)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        assert c.get('/api/generations/'+id).json()['state']=='failed'
        assert c.get('/api/generations/'+id+'/image').status_code==409


def test_visible_duplicate_cannot_keep_a_conflicting_fact():
    html=HTML.replace('</main>','<p data-field="date">2030-01-01</p></main>')
    repaired,_=normalize_design(html,facts_from_brief(BRIEF))
    assert '2030-01-01' not in repaired
    validate_generated(repaired,BRIEF)


def test_repair_respects_budget_before_another_call(tmp_path,monkeypatch):
    monkeypatch.setenv('STUDIO_BUDGET_CNY','0.1')
    calls=[]
    def handler(req):calls.append(req);return result('broken')
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        job=c.get('/api/generations/'+id).json()
        assert job['state']=='failed' and '预算不足' in job['error']
        assert len(calls)==1 and c.get('/api/status').json()['reserved']==0


def test_truncated_output_is_repaired_before_rendering(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);return result(finish='length' if len(calls)==1 else 'stop')
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        assert c.get('/api/generations/'+id).json()['state']=='complete'
        assert len(calls)==2
