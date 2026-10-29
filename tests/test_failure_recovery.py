import json
from pathlib import Path
import httpx
import pytest
from fastapi.testclient import TestClient
from posterlab.server import Ledger
from test_generation import build, result, REQUEST, HEADERS, fake_render


def generate(c):
    id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
    return c.get('/api/generations/'+id).json()


@pytest.mark.parametrize('status,code,reserved',[(401,'provider_auth',0),(403,'provider_auth',0),(402,'provider_quota',0),(429,'provider_rate_limit',0),(400,'provider_rejected',0),(500,'provider_unavailable',.1),(408,'provider_unavailable',.1)])
def test_provider_errors_are_actionable_without_leaking_bodies(tmp_path,monkeypatch,status,code,reserved):
    calls=[]
    def handler(req):
        calls.append(req)
        return httpx.Response(status,json={'error':'private provider body test-secret'},headers={'Retry-After':'60'})
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        job=generate(c)
        assert job['state']=='failed' and job['failure']['code']==code
        assert len(calls)==1 and c.get('/api/status').json()['reserved']==reserved
        assert 'private provider' not in json.dumps(job)
        if status==429:
            r=c.post('/api/generations/'+job['id']+'/retry',headers={'Idempotency-Key':'retry-rate-limit'},json={})
            assert r.status_code==429 and int(r.headers['retry-after'])>0 and len(calls)==1


@pytest.mark.parametrize('body',[[],{}, {'choices':[]}, {'choices':[None]}, {'choices':[{'message':{'content':None}}]}, {'choices':'invalid'}])
def test_malformed_provider_envelope_is_handled_without_retry(tmp_path,monkeypatch,body):
    calls=[]
    def handler(req):calls.append(req);return httpx.Response(200,json=body)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        job=generate(c)
        assert job['failure']['code']=='provider_response' and job['failure']['charge_uncertain']
        assert len(calls)==1
        assert c.get('/api/status').json()['reserved']==.1


def test_invalid_provider_json(tmp_path,monkeypatch):
    with TestClient(build(tmp_path,monkeypatch,lambda req:httpx.Response(200,text='<html>gateway</html>'))) as c:
        assert generate(c)['failure']['code']=='provider_response'


@pytest.mark.parametrize('error,code,reserve',[(httpx.ConnectTimeout,'connection_failed',0),(httpx.ReadTimeout,'network_unknown',.1)])
def test_transport_outcomes_and_restart_do_not_leak_concurrency(tmp_path,monkeypatch,error,code,reserve):
    def handler(req):raise error('private-token',request=req)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        job=generate(c)
        assert job['failure']['code']==code and c.get('/api/status').json()['reserved']==reserve
        assert 'private-token' not in json.dumps(job)


def test_stale_calls_on_restart_keep_reservations_but_release_slots(tmp_path):
    ledger=Ledger(tmp_path/'usage.sqlite3',5)
    ledger.reserve('old-1','one');ledger.reserve('old-2','two')
    ledger=Ledger(tmp_path/'usage.sqlite3',5)
    ledger.reserve('new-1','three')
    assert ledger.totals()['reserved']==pytest.approx(.3)
    with ledger.connect() as db:
        assert db.execute("select count(*) from calls where state='pending'").fetchone()[0]==1
    with pytest.raises(Exception):ledger.reserve('old-1','one')


def test_corrupt_png_uses_only_local_retries_and_preserves_design(tmp_path,monkeypatch):
    calls=[];renders=[]
    def handler(req):calls.append(req);return result()
    def corrupt(html,w,h,path,fonts):
        renders.append(1)
        path.write_bytes(b'corrupt')
        return {}
    with TestClient(build(tmp_path,monkeypatch,handler,renderer=corrupt)) as c:
        job=generate(c)
        assert job['failure']['code']=='render_output' and job['can_rerender']
        assert len(calls)==1 and len(renders)==2
        assert c.get('/api/generations/'+job['id']+'/image').status_code==409
        with c.app.state.ledger.connect() as db:
            assert db.execute("select count(*) from calls where state='pending'").fetchone()[0]==0


def test_diagnostic_disk_failure_does_not_leave_a_pending_call(tmp_path,monkeypatch):
    original=Path.write_text
    def fail(path,*args,**kwargs):
        if path.name=='attempt-1-request.json':raise OSError('disk full')
        return original(path,*args,**kwargs)
    monkeypatch.setattr(Path,'write_text',fail)
    with TestClient(build(tmp_path,monkeypatch,lambda req:pytest.fail('No provider call before saved request'))) as c:
        job=generate(c)
        assert job['failure']['code']=='storage_error'
        assert c.get('/api/status').json()['reserved']==0
        with c.app.state.ledger.connect() as db:
            assert db.execute("select count(*) from calls where state='pending'").fetchone()[0]==0


def test_missing_completed_file_can_be_restored_without_model(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);return result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        job=generate(c);id=job['id']
        (tmp_path/'generations'/id/'poster.png').unlink()
        broken=c.get('/api/generations/'+id).json()
        assert broken['state']=='failed' and broken['failure']['code']=='artifact_missing'
        assert broken['can_rerender']
        c.post('/api/generations/'+id+'/rerender',json={})
        restored=c.get('/api/generations/'+id).json()
        assert restored['state']=='complete' and restored['failure'] is None
        assert len(restored['failure_history'])==1 and len(calls)==1


def test_invalid_usage_is_not_added_to_billing(tmp_path,monkeypatch):
    def handler(req):
        raw=json.loads(result().content);raw['usage']={'prompt_tokens':-99,'completion_tokens':'oops'}
        return httpx.Response(200,json=raw)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        job=generate(c)
        assert job['state']=='complete' and job['cost'] is None
        assert job['usage']['prompt_tokens']==0 and c.get('/api/status').json()['reserved']==.1


def test_comparison_failure_does_not_discard_valid_new_poster(tmp_path,monkeypatch):
    with TestClient(build(tmp_path,monkeypatch,lambda req:result())) as c:
        job=generate(c)
        import posterlab.generation as generation
        monkeypatch.setattr(generation,'visual_delta',lambda *args:(_ for _ in ()).throw(OSError('missing original')))
        revised=c.post('/api/generations',json={**REQUEST,'revision_of':job['id']},headers={'Idempotency-Key':'revision-compare-test'}).json()
        done=c.get('/api/generations/'+revised['id']).json()
        assert done['state']=='complete' and '对比暂不可用' in done['report']['warnings'][0]


def test_saved_chat_handoff_is_retryable_without_repaying_chat(tmp_path,monkeypatch):
    from test_chat import chat_result
    monkeypatch.setenv('STUDIO_BUDGET_CNY','0.1')
    calls=[]
    def handler(req):calls.append(json.loads(req.content));return chat_result('design') if len(calls)==1 else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        payload={'messages':[{'role':'user','content':'生成一张海报：设计开放日'}]}
        response=c.post('/api/chat',json=payload,headers=HEADERS)
        assert response.status_code==402 and response.json()['detail']['request_reusable']
        c.app.state.ledger.budget=5
        resumed=c.post('/api/chat',json=payload,headers=HEADERS)
        assert resumed.status_code==200 and len(calls)==2
