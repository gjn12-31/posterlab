import json
from concurrent.futures import ThreadPoolExecutor
import httpx
import pytest
from fastapi.testclient import TestClient
from posterlab.server import create_app, Ledger, RESERVE

PAYLOAD = {'brief':{'title':'设计开放日', 'date':'2026-11-08'}, 'locked':['date'], 'theme':'violet', 'titleScale':1, 'instruction':'标题更有吸引力'}
HEADERS = {'Idempotency-Key':'test-request-0001'}

def response(fields=None, **kwargs):
    content = {'fields': fields or {'title':'让设计发生'}, 'reason':'标题建议'}
    content.update(kwargs)
    return httpx.Response(200, json={'choices':[{'message':{'content':json.dumps(content)}, 'finish_reason':'stop'}], 'usage':{'prompt_tokens':100, 'completion_tokens':200}})

def client(tmp_path, handler, **kwargs):
    return TestClient(create_app(tmp_path, api_key='test-secret', transport=httpx.MockTransport(handler), serve_site=False, **kwargs))

def test_status_is_free_and_key_is_not_exposed(tmp_path):
    c=client(tmp_path, lambda req:pytest.fail('Status must not invoke a model'))
    r=c.get('/api/status')
    assert r.status_code==200 and r.json()['spent']==0
    assert 'test-secret' not in r.text

def test_locked_fields_idempotency_and_accounting(tmp_path):
    calls=[]
    def handler(req):
        calls.append(req)
        return response({'date':'2030-01-01','title':'让设计发生'})
    c=client(tmp_path,handler)
    r=c.post('/api/assist',json=PAYLOAD,headers=HEADERS)
    assert r.status_code==200
    assert r.json()['fields']=={'title':'让设计发生'}
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).json()==r.json()
    assert len(calls)==1
    assert c.get('/api/status').json()['spent']==pytest.approx(.00049)
    assert c.get('/api/status').json()['reserved']==0
    assert c.post('/api/assist',json={**PAYLOAD,'instruction':'不同内容'},headers=HEADERS).status_code==409

def test_extraction_can_propose_locked_fields_for_review(tmp_path):
    c=client(tmp_path,lambda req:response({'date':'2026-11-09'}))
    r=c.post('/api/assist',json={**PAYLOAD,'kind':'extract'},headers=HEADERS)
    assert r.json()['fields']['date']=='2026-11-09'
    assert '提取' in r.json()['reason']

@pytest.mark.parametrize('bad', [{'url':'javascript:alert(1)'},{'date':'2026-02-30'},{'title':'x'*181},{'script':'alert(1)'}])
def test_invalid_model_result_cannot_modify_project(tmp_path,bad):
    c=client(tmp_path,lambda req:response(bad))
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==502
    assert c.get('/api/status').json()['spent']>0
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==409

def test_timeout_never_retries_and_survives_restart(tmp_path):
    calls=[]
    def handler(req):
        calls.append(req)
        raise httpx.ReadTimeout('unknown', request=req)
    c=client(tmp_path,handler)
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==502
    assert len(calls)==1
    assert c.get('/api/status').json()['reserved']==RESERVE
    c=client(tmp_path,handler)
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==409
    assert len(calls)==1

def test_budget_and_untrusted_requests_never_call_provider(tmp_path):
    c=client(tmp_path,lambda req:pytest.fail('Must not call provider'),budget=.09)
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==402
    assert c.post('/api/assist',json=PAYLOAD,headers={**HEADERS,'Origin':'https://evil.example'}).status_code==403
    assert c.post('/api/assist',json=PAYLOAD,headers={**HEADERS,'Host':'evil.example'}).status_code==403
    assert c.post('/api/assist',json=PAYLOAD,headers={**HEADERS,'Sec-Fetch-Site':'cross-site'}).status_code==403
    assert c.post('/api/assist',content='x'*64001,headers={**HEADERS,'Content-Type':'application/json'}).status_code==413
    assert c.post('/api/assist',json={**PAYLOAD,'instruction':'x'*12001},headers=HEADERS).status_code==422

def test_atomic_budget_under_concurrent_reservation(tmp_path):
    ledger=Ledger(tmp_path/'ledger.sqlite3',.1)
    def reserve(n):
        try:
            ledger.reserve(str(n),str(n));return True
        except Exception:return False
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(reserve,range(8)))==1
    assert ledger.totals()['reserved']==.1

def test_missing_usage_keeps_conservative_reservation(tmp_path):
    raw={'choices':[{'message':{'content':'{"fields":{"title":"Hello"}}'},'finish_reason':'stop'}]}
    c=client(tmp_path,lambda req:httpx.Response(200,json=raw))
    assert c.post('/api/assist',json=PAYLOAD,headers=HEADERS).status_code==200
    assert c.get('/api/status').json()['reserved']==RESERVE


def test_edit_diff_omits_unchanged_values(tmp_path):
    c=client(tmp_path,lambda req:response({'title':'设计开放日','description':'','date':'2026-11-08'},theme='violet',titleScale=1))
    r=c.post('/api/assist',json=PAYLOAD,headers=HEADERS)
    assert r.status_code==200 and r.json()['fields']=={}
    assert 'theme' not in r.json() and 'titleScale' not in r.json()
