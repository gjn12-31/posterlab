import json
from fastapi.testclient import TestClient
from test_generation import build, result, REQUEST, HEADERS
from test_chat import chat_result
from test_evaluation import vision_result


def test_catalog_and_invalid_capabilities_never_call_provider(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);return result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        catalog=c.get('/api/models').json()
        assert len(catalog['models'])==3
        assert 'review' not in next(m for m in catalog['models'] if m['id']=='step-3.5-flash')['roles']
        assert c.post('/api/generations',json={**REQUEST,'model':'unlisted'},headers=HEADERS).status_code==400
        assert c.post('/api/evaluations',json={'generation_id':'a'*32,'model':'step-3.5-flash'},headers=HEADERS).status_code==400
        assert c.post('/api/chat',json={'messages':[{'role':'user','content':'你好'}],'model':'unlisted'},headers=HEADERS).status_code==400
        assert calls==[]


def test_chat_and_design_models_are_independent_and_frozen_in_request(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        body=json.loads(req.content);calls.append(body)
        return chat_result('design') if '与用户对话' in body['messages'][0]['content'] else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        body={'messages':[{'role':'user','content':'生成设计开放日海报'}],'model':'step-3.7-flash','design_model':'step-5-preview'}
        first=c.post('/api/chat',json=body,headers=HEADERS)
        assert first.status_code==200
        job=c.get('/api/generations/'+first.json()['job']['id']).json()
        assert job['model']=='step-5-preview' and job['state']=='complete'
        assert [x['model'] for x in calls]==['step-3.7-flash','step-5-preview']
        assert 'max_tokens' not in calls[1]
        assert first.json()['cost'] is None
        assert c.post('/api/chat',json={**body,'design_model':'step-3.5-flash'},headers=HEADERS).status_code==409
        assert len(calls)==2


def test_selected_generation_model_controls_image_feedback(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(json.loads(req.content));return result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        initial=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        for i,model in enumerate(['step-3.7-flash','step-3.5-flash']):
            job=c.post('/api/generations',json={**REQUEST,'revision_of':initial,'model':model},headers={'Idempotency-Key':f'model-revision-{i}'}).json()
            done=c.get('/api/generations/'+job['id']).json()
            assert done['model']==model and done['state']=='complete'
            assert 'max_tokens' not in calls[-1]
            assert done['reference_image_used']==(i==0)
        assert isinstance(calls[1]['messages'][1]['content'],list)
        assert isinstance(calls[2]['messages'][1]['content'],str)


def test_review_cache_is_partitioned_by_model_and_apply_uses_selected_designer(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        body=json.loads(req.content);calls.append(body)
        return vision_result() if '平面设计评审' in body['messages'][0]['content'] else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        reviews=[]
        for i,model in enumerate(['step-3.7-flash','step-5-preview']):
            body={'generation_id':original,'model':model}
            r=c.post('/api/evaluations',json=body,headers={'Idempotency-Key':f'review-model-{i}'}).json();reviews.append(r)
            assert c.get('/api/evaluations/for/'+original,params={'model':model}).json()['id']==r['id']
            assert c.post('/api/evaluations',json=body,headers={'Idempotency-Key':f'cached-model-{i}'}).json()['id']==r['id']
        assert reviews[0]['id']!=reviews[1]['id'] and len(calls)==3
        assert c.post('/api/evaluations',json={'generation_id':original,'model':'step-5-preview'},headers={'Idempotency-Key':'review-model-0'}).status_code==409
        job=c.post('/api/evaluations/'+reviews[1]['id']+'/apply',json={'dimension_ids':['layout'],'design_model':'step-3.7-flash'},headers={'Idempotency-Key':'apply-selected-model'}).json()
        assert job['model']=='step-3.7-flash' and calls[-1]['model']=='step-3.7-flash'
