import io
import json
from pathlib import Path
from zipfile import ZipFile
import pytest
from fastapi.testclient import TestClient
from posterlab.generation import validate_generated, render_document
from test_generation import build, result, HTML, BRIEF, REQUEST, HEADERS
from test_chat import chat_result

ASSET_HTML=HTML.replace('</main>', '<img data-asset="coffee-ink" src="assets/coffee-ink.png" style="position:absolute;left:80px;top:1000px;width:180px;height:180px"></main>')

def test_unknown_assets_and_multiple_backgrounds_rejected_without_model_call(tmp_path,monkeypatch):
    def handler(req):pytest.fail('Invalid asset selection must not call the provider')
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        assert len(c.get('/api/assets').json()['assets'])==32
        for ids in [['../../secret'],['aurora','paper'],['coffee-ink','coffee-ink']]:
            assert c.post('/api/generations',json={**REQUEST,'asset_ids':ids},headers=HEADERS).status_code==400
            assert c.post('/api/chat',json={'messages':[{'role':'user','content':'生成咖啡海报'}],'asset_ids':ids},headers=HEADERS).status_code==400
        assert c.get('/api/status').json()['spent']==0


def test_selected_asset_is_required_and_only_selected_paths_allowed():
    validate_generated(ASSET_HTML,BRIEF,['coffee-ink'])
    for html,ids in [(HTML,['coffee-ink']),(ASSET_HTML,[]),(ASSET_HTML.replace('assets/coffee-ink.png','https://example.com/x.png'),['coffee-ink']),(ASSET_HTML.replace('data-asset="coffee-ink"',''),['coffee-ink'])]:
        with pytest.raises(ValueError):validate_generated(html,BRIEF,ids)


def test_real_renderer_loads_offline_images_and_rejects_hidden_assets(tmp_path):
    fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
    report=render_document(validate_generated(ASSET_HTML,BRIEF,['coffee-ink']),1080,1440,tmp_path/'asset.png',fonts)
    assert report['width']==1080
    with pytest.raises(ValueError,match='素材不可见'):
        render_document(ASSET_HTML.replace('width:180px','opacity:0;width:180px'),1080,1440,tmp_path/'hidden.png',fonts)


def test_source_package_includes_actual_materials_and_license(tmp_path,monkeypatch):
    with TestClient(build(tmp_path,monkeypatch,lambda req:result(ASSET_HTML))) as c:
        id=c.post('/api/generations',json={**REQUEST,'asset_ids':['coffee-ink']},headers=HEADERS).json()['id']
        assert c.get('/api/generations/'+id).json()['asset_ids']==['coffee-ink']
        archive=ZipFile(io.BytesIO(c.get('/api/generations/'+id+'/package').content))
        assert archive.read('assets/coffee-ink.png').startswith(b'\x89PNG')
        assert b'ISC' in archive.read('assets/LICENSE.txt')


def test_refinement_inherits_assets_but_explicit_empty_list_removes_them(tmp_path,monkeypatch):
    def handler(req):
        payload=json.loads(req.content)
        if payload['max_tokens']==3000:return chat_result('design')
        user=json.loads(payload['messages'][1]['content'])
        return result(ASSET_HTML if user['已选素材'] else HTML)
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        original=c.post('/api/generations',json={**REQUEST,'asset_ids':['coffee-ink']},headers=HEADERS).json()['id']
        body={'messages':[{'role':'user','content':'标题更大'}],'current_id':original}
        inherited=c.post('/api/chat',json=body,headers={'Idempotency-Key':'inherit-asset-test'}).json()['job']
        cleared=c.post('/api/chat',json={**body,'asset_ids':[]},headers={'Idempotency-Key':'clear-asset-test'}).json()['job']
        assert inherited['asset_ids']==['coffee-ink'] and cleared['asset_ids']==[]
        assert c.get('/api/generations/'+inherited['id']).json()['state']=='complete'
        assert c.get('/api/generations/'+cleared['id']).json()['state']=='complete'


def test_plan_mode_never_enqueues_even_if_model_requests_design(tmp_path,monkeypatch):
    calls=[]
    def handler(req):calls.append(req);return chat_result('design',brief='')
    with TestClient(build(tmp_path,monkeypatch,handler)) as c:
        res=c.post('/api/chat',json={'mode':'plan','messages':[{'role':'user','content':'咖啡市集，暖色风格'}]},headers=HEADERS)
        assert res.status_code==200 and res.json()['job'] is None
        assert len(calls)==1 and c.get('/api/generations').json()==[]


def test_retail_facts_and_organizer_are_validated_independently():
    from posterlab.generation import facts_from_brief
    facts=facts_from_brief('标题：新品上市\n主讲人：李老师\n主办方：山间咖啡\n价格：39元\n产品名称：夏日冷萃\n卖点：低温萃取')
    assert facts['speaker']=='李老师' and facts['organizer']=='山间咖啡'
    assert facts['price']=='39元' and facts['product']=='夏日冷萃'


def test_selected_material_can_repeat_as_a_visual_motif():
    repeated=ASSET_HTML.replace('</main>','<img data-asset="coffee-ink" src="assets/coffee-ink.png"></main>')
    validate_generated(repeated,BRIEF,['coffee-ink'])
