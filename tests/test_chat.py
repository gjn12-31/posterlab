import json
import httpx
from fastapi.testclient import TestClient
from test_generation import build, result, HTML, BRIEF

HEADERS={'Idempotency-Key':'chat-request-001'}

def chat_result(action='reply',brief=BRIEF,reply='可以先考虑编辑式排版。'):
    return httpx.Response(200,json={'id':'chat-response-1','choices':[{'finish_reason':'stop','message':{'content':json.dumps({'action':action,'reply':reply,'brief':brief,'style':'paper','format':'portrait','instruction':'保持简洁'})}}],'usage':{'prompt_tokens':1000,'completion_tokens':200}})


def test_advice_does_not_generate_poster_and_retry_does_not_bill_twice(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);return chat_result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        body={'messages':[{'role':'user','content':'有哪些风格适合设计开放日？'}]}
        first=c.post('/api/chat',json=body,headers=HEADERS)
        assert first.status_code==200 and first.json()['job'] is None
        assert c.post('/api/chat',json=body,headers=HEADERS).json()==first.json()
        assert len(calls)==1 and c.get('/api/generations').json()==[]


def test_chat_handoff_generates_once_and_includes_conversation_context(tmp_path,monkeypatch):
    calls=[]
    def handler(req):
        data=json.loads(req.content);calls.append(data)
        return chat_result('design') if data.get('max_tokens')==3000 else result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        body={'messages':[{'role':'user','content':'先用纸白和红色'}, {'role':'assistant','content':'好的，编辑风格。'}, {'role':'user','content':'按刚才的方向生成设计开放日海报'}]}
        response=c.post('/api/chat',json=body,headers=HEADERS)
        assert response.status_code==200
        id=response.json()['job']['id']
        assert c.get('/api/generations/'+id).json()['state']=='complete'
        assert c.post('/api/chat',json=body,headers=HEADERS).json()['job']['id']==id
        assert len(calls)==2
        assert any(m['content']=='先用纸白和红色' for m in calls[0]['messages'])
        changed={**body,'messages':[{'role':'user','content':'其他内容'}]}
        assert c.post('/api/chat',json=changed,headers=HEADERS).status_code==409


def test_conversational_date_edit_preserves_original_and_updates_validation(tmp_path,monkeypatch):
    count=0
    def handler(req):
        nonlocal count
        data=json.loads(req.content)
        if data.get('max_tokens')==3000:return chat_result('design',BRIEF.replace('2026-11-08','2026-11-09'))
        count+=1
        return result(HTML if count==1 else HTML.replace('2026-11-08','2026-11-09'))
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json={'brief':BRIEF,'style':'paper'},headers={'Idempotency-Key':'original-test-001'}).json()['id']
        body={'messages':[{'role':'user','content':'日期改为2026-11-09，其余不变'}],'current_id':original}
        res=c.post('/api/chat',json=body,headers=HEADERS);assert res.status_code==200
        revised=res.json()['job']['id']
        assert c.get('/api/generations/'+revised).json()['state']=='complete'
        assert '2026-11-09' in c.get('/api/generations/'+revised+'/source').json()['html']
        assert '2026-11-08' in c.get('/api/generations/'+original+'/source').json()['html']


def test_chat_timeout_does_not_resend_unknown_request(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);raise httpx.ReadTimeout('timeout',request=req)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        body={'messages':[{'role':'user','content':'帮我做一张咖啡海报'}]}
        assert c.post('/api/chat',json=body,headers=HEADERS).status_code==504
        assert c.post('/api/chat',json=body,headers=HEADERS).status_code==409
        assert len(calls)==1 and c.get('/api/status').json()['reserved']==.1


def test_advice_allows_empty_unused_design_fields(tmp_path,monkeypatch):
    def handler(req):
        return httpx.Response(200,json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'action':'reply','reply':'先从音乐类型确定风格。','style':'','format':'','brief':''})}}],'usage':{'prompt_tokens':100,'completion_tokens':100}})
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        response=c.post('/api/chat',json={'messages':[{'role':'user','content':'给我一些建议'}]},headers=HEADERS)
        assert response.status_code==200 and response.json()['job'] is None


def test_provider_json_fence_is_accepted_without_exposing_raw_validation(tmp_path,monkeypatch):
    def handler(req):
        raw=chat_result().json()
        raw['choices'][0]['message']['content']='```json\n'+raw['choices'][0]['message']['content']+'\n```'
        return httpx.Response(200,json=raw)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        response=c.post('/api/chat',json={'messages':[{'role':'user','content':'先给我建议'}]},headers=HEADERS)
        assert response.status_code==200 and response.json()['job'] is None


def test_revision_missing_style_keeps_current_direction(tmp_path,monkeypatch):
    def handler(req):
        payload=json.loads(req.content)
        if payload.get('max_tokens')==3000:
            raw=chat_result('design').json()
            decision=json.loads(raw['choices'][0]['message']['content'])
            del decision['style'];del decision['format']
            raw['choices'][0]['message']['content']=json.dumps(decision)
            return httpx.Response(200,json=raw)
        return result()
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json={'brief':BRIEF,'style':'paper'},headers={'Idempotency-Key':'keep-style-original'}).json()['id']
        revised=c.post('/api/chat',json={'messages':[{'role':'user','content':'标题更大'}],'current_id':original},headers=HEADERS).json()['job']
        assert revised['style']=='paper'
