import json
import httpx
import pytest
from fastapi.testclient import TestClient
from posterlab.evaluation import RUBRIC, parse_critique, revision_instruction
from test_generation import build, result, REQUEST, HEADERS

REPORT={'summary':'标题具有明确焦点，信息阅读路径还可以更清晰。','strengths':['暖纸色调与咖啡主题相符'], 'dimensions':[{'id':d['id'],'score':70+i*3,'evidence':'画面上部标题醒目，底部信息需要更清晰的排布。','suggestion':'保留文字原文，提高次级信息字号并增加行距。'} for i,d in enumerate(RUBRIC)]}
def vision_result(report=REPORT):
    return httpx.Response(200,json={'id':'vision-response-test','model':'step-3.7-flash','choices':[{'finish_reason':'stop','message':{'content':json.dumps(report)}}],'usage':{'prompt_tokens':1500,'completion_tokens':600}})

def test_critique_requires_six_unique_dimensions_and_computes_weighted_total():
    parsed=parse_critique(json.dumps(REPORT))
    assert parsed['overall']==round(sum((70+i*3)*d['weight'] for i,d in enumerate(RUBRIC))/100,1)
    with pytest.raises(ValueError):parse_critique(json.dumps({**REPORT,'dimensions':[REPORT['dimensions'][0]]*6}))
    with pytest.raises(ValueError):parse_critique(json.dumps({**REPORT,'dimensions':[{**d,'score':101} for d in REPORT['dimensions']]}))
    with pytest.raises(ValueError):parse_critique(json.dumps({**REPORT,'dimensions':[{**d,'score':True} for d in REPORT['dimensions']]}))

def test_image_review_caches_and_selected_fix_preserves_facts(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        data=json.loads(req.content);calls.append(data)
        return vision_result() if data['model']=='step-3.7-flash' else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        first=c.post('/api/evaluations',json={'generation_id':original},headers={'Idempotency-Key':'review-test-one'});assert first.status_code==202
        review=c.get('/api/evaluations/'+first.json()['id']).json()
        assert review['state']=='complete' and review['basis']=='rendered-image'
        image=calls[1]['messages'][1]['content'][1]['image_url']['url'];assert image.startswith('data:image/png;base64,')
        for key in ['review-test-one','review-test-two']:
            cached=c.post('/api/evaluations',json={'generation_id':original},headers={'Idempotency-Key':key}).json()
            assert cached['id']==review['id']
        assert len(calls)==2
        assert c.get('/api/evaluations/for/'+original).json()['id']==review['id']
        revised=c.post('/api/evaluations/'+review['id']+'/apply',json={'dimension_ids':['legibility'],'note':'保持暖色调'},headers={'Idempotency-Key':'apply-review-test'}).json()
        assert revised['revision_of']==original and revised['brief']==REQUEST['brief'] and revised['style']==REQUEST['style']
        assert revised['evaluation_id']==review['id']
        assert '文字可读性' in revised['instruction'] and '配色与风格：' not in revised['instruction']
        assert c.get('/api/generations/'+revised['id']).json()['state']=='complete'
        again=c.post('/api/evaluations/'+review['id']+'/apply',json={'dimension_ids':['legibility'],'note':'保持暖色调'},headers={'Idempotency-Key':'apply-review-test'}).json()
        assert again['id']==revised['id'] and len(calls)==3
        assert c.post('/api/evaluations/'+review['id']+'/apply',json={'dimension_ids':['legibility','legibility']},headers={'Idempotency-Key':'invalid-review-test'}).status_code==400
        assert c.post('/api/evaluations/'+review['id']+'/apply',json={'dimension_ids':[]},headers={'Idempotency-Key':'empty-review-test'}).status_code==422

def test_invalid_review_never_becomes_a_fabricated_score(tmp_path,monkeypatch):
    def handler(req):return vision_result({'summary':'missing metrics'}) if json.loads(req.content)['model']=='step-3.7-flash' else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        id=c.post('/api/evaluations',json={'generation_id':original},headers={'Idempotency-Key':'invalid-score-test'}).json()['id']
        review=c.get('/api/evaluations/'+id).json()
        assert review['state']=='failed' and 'report' not in review
        assert c.post('/api/evaluations/'+id+'/apply',json={'dimension_ids':['layout']},headers={'Idempotency-Key':'reject-apply-test'}).status_code==400

def test_evaluation_timeout_does_not_automatically_resubmit(tmp_path,monkeypatch):
    count=0
    def handler(req):
        nonlocal count
        if json.loads(req.content)['model']=='step-3.7-flash':count+=1;raise httpx.ReadTimeout('timeout',request=req)
        return result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
        body={'generation_id':original};headers={'Idempotency-Key':'timeout-review-test'}
        id=c.post('/api/evaluations',json=body,headers=headers).json()['id']
        assert c.post('/api/evaluations',json=body,headers=headers).json()['id']==id
        assert c.get('/api/evaluations/'+id).json()['state']=='failed' and count==1
        assert c.get('/api/status').json()['reserved']==.1


def test_benign_extra_fields_are_ignored_but_missing_evidence_is_rejected():
    rich={**REPORT,'overall':99,'strengths':['值得保留的优点']*6,'dimensions':[{**d,'引用的海报文案':'额外解释'} for d in REPORT['dimensions']]}
    parsed=parse_critique(json.dumps(rich))
    assert len(parsed['strengths'])==4
    assert parsed['overall']==parse_critique(json.dumps(REPORT))['overall']
    del rich['dimensions'][0]['evidence']
    with pytest.raises(ValueError):parse_critique(json.dumps(rich))


def test_review_revision_modes_do_not_lock_old_layout():
    parsed=parse_critique(json.dumps(REPORT))
    text=revision_instruction(parsed,['layout'],'新的视觉焦点','reimagine')
    assert '不要沿用旧HTML结构' in text and '全部事实原文不变' in text
    assert '避免无关重设计' not in text
