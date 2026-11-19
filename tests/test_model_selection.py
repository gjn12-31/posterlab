import json
import httpx
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


def test_outreach_stages_use_selected_model_and_separate_cached_results(tmp_path, monkeypatch):
    import base64
    from io import BytesIO
    from PIL import Image
    from posterlab.server import create_app
    from test_campaign_artwork import image_bytes
    from test_outreach import CAMPAIGN, CAMPAIGN_RESULT, completion
    from test_paper_poster import SOURCE, CHOSEN, DESIGN
    from test_server import PAYLOAD, response

    monkeypatch.setenv('POSTERLAB_PROVIDER', 'paratera')
    observed = []
    replies = []
    def upstream(request):
        payload = json.loads(request.content)
        observed.append((request.url.path, payload['model']))
        return replies.pop(0)

    client = TestClient(create_app(tmp_path, api_key='fixture', transport=httpx.MockTransport(upstream)))
    catalog = client.get('/api/models').json()
    flash, vision, image = 'DeepSeek-V4.1-Flash-1017', 'GLM-4.6V', 'Doubao-Seedream-4.0'
    assert next(m['roles'] for m in catalog['models'] if m['id'] == image) == ['artwork']

    def checked(path, body, model, result, api='chat/completions'):
        headers = {'Idempotency-Key': 'choice-check-' + path.rsplit('/',1)[-1]}
        old_count = len(observed)
        replies.append(result)
        request = {**body, 'model':model}
        first = client.post('/api/' + path, json=request, headers=headers)
        assert first.status_code == 200 and first.json()['model'] == model, first.text[:400]
        again = client.post('/api/' + path, json=request, headers=headers)
        assert again.json() == first.json() and len(observed) == old_count + 1
        assert observed[-1] == ('/v1/' + api, model)
        return first.json()

    reading = checked('outreach/paper-reading', SOURCE, flash, completion(CHOSEN))
    checked('outreach/paper-layout', {'title': SOURCE['title'], 'reading': reading['reading']},
            flash, completion(DESIGN))
    paper = {'title':'Field guide', 'sections':{'abstract':'Four maps were compared.'}}
    checked('outreach/paper', paper, flash, completion({'moments':'给常用旧地图的朋友，一起来看那条还留着原名的街。'}))
    changed = client.post('/api/outreach/paper', json={**paper,'model':'Kimi-K3.1-Pro'},
                          headers={'Idempotency-Key':'choice-check-paper'})
    assert changed.status_code == 409
    checked('assist', {**PAYLOAD, 'workflow':'paper'}, flash, response())
    checked('outreach/campaign', CAMPAIGN, flash, completion(CAMPAIGN_RESULT))
    for path, body in [('outreach/paper-artwork', {'title':'Map','abstract':'Four maps were compared.'}),
                       ('outreach/artwork',{'title':'Map workshop'})]:
        image_reply = httpx.Response(200,json={'data':[{'b64_json':base64.b64encode(image_bytes()).decode()}]})
        checked(path, body, image, image_reply, 'images/generations')
    preview = BytesIO()
    Image.new('RGB',(300,400),'blue').save(preview,'JPEG')
    proof = {'brief':{'title':'Map workshop'},'format':'portrait','jpeg':base64.b64encode(preview.getvalue()).decode()}
    checked('outreach/campaign-review', proof, vision, vision_result())
    # Reject a text-only model for both pixel operations before reserving or calling the provider.
    for path, body in [('outreach/campaign-review',proof), ('outreach/artwork',{'title':'Maps'})]:
        assert client.post('/api/'+path, json={**body,'model':flash},headers={'Idempotency-Key':'bad-choice-01'}).status_code == 400
    assert len(observed) == 8
