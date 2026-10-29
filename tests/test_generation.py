import json
from pathlib import Path
import httpx
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from posterlab.server import create_app
from posterlab.generation import validate_generated,render_document,PRESETS

BRIEF='标题：设计开放日\n日期：2026-11-08\n地点：城市艺术中心'
HTML='''<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}#poster{width:1080px;height:1440px;background:#eee5d7;padding:80px;color:#222;font-family:PosterSans}h1{font-size:110px;margin:50px 0 180px}p{font-size:32px;margin:30px 0}</style></head><body><main id="poster"><h1 data-field="title">设计开放日</h1><p data-field="date">2026-11-08</p><p data-field="venue">城市艺术中心</p></main></body></html>'''
REQUEST={'brief':BRIEF,'style':'paper','format':'portrait'}
HEADERS={'Idempotency-Key':'generation-test-0001'}

def result(html=HTML,finish='stop'):
 return httpx.Response(200,json={'id':'real-response-id','choices':[{'finish_reason':finish,'message':{'content':json.dumps({'html':html,'summary':'编辑式排版'})}}],'usage':{'prompt_tokens':1200,'completion_tokens':1800}})

def fake_render(html,w,h,path,fonts):
 Image.new('RGB',(w,h),'#eee5d7').save(path)
 return {'width':w,'height':h,'renderer':'test renderer','warnings':[]}

def build(tmp_path,monkeypatch,handler,renderer=fake_render,design_model='step-3.5-flash',vision_model='step-3.7-flash'):
 monkeypatch.setenv('STEP_DESIGN_MODEL',design_model)
 monkeypatch.setenv('STEP_VISION_MODEL',vision_model)
 import posterlab.generation as g
 # register_generation default is bound at import; inject the test renderer explicitly.
 original=g.register_generation
 monkeypatch.setattr(g,'register_generation',lambda app,ledger,key,model,transport:original(app,ledger,key,model,transport,renderer))
 return create_app(tmp_path,api_key='test-only',transport=httpx.MockTransport(handler),serve_site=False)

def test_generated_html_is_not_a_local_template_and_is_saved_once(tmp_path,monkeypatch):
 calls=[]
 def handler(req):calls.append(json.loads(req.content));return result()
 app=build(tmp_path,monkeypatch,handler)
 with TestClient(app) as c:
  first=c.post('/api/generations',json=REQUEST,headers=HEADERS);assert first.status_code==202
  id=first.json()['id'];job=c.get('/api/generations/'+id).json()
  assert job['state']=='complete' and job['provider_response_id']=='real-response-id'
  assert job['preset_prompt']==PRESETS['paper']['prompt']
  assert c.get('/api/generations/'+id+'/source').json()['html']==HTML
  assert c.get('/api/generations/'+id+'/image').headers['content-type']=='image/png'
  assert c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']==id
  assert len(calls)==1 and '独立文化杂志' in calls[0]['messages'][0]['content']
  assert c.get('/api/status').json()['reserved']==0
  assert c.post('/api/generations',json={**REQUEST,'style':'blue'},headers=HEADERS).status_code==409

def test_refinement_sends_original_html_and_preserves_original(tmp_path,monkeypatch):
 calls=[]
 def handler(req):calls.append(json.loads(req.content));return result()
 app=build(tmp_path,monkeypatch,handler)
 with TestClient(app) as c:
  id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
  revised=c.post('/api/generations',json={**REQUEST,'revision_of':id,'instruction':'标题更大'},headers={'Idempotency-Key':'revision-test-0001'}).json()
  assert c.get('/api/generations/'+revised['id']).json()['state']=='complete'
  assert json.loads(calls[1]['messages'][1]['content'])['已有设计HTML']==HTML
  assert c.get('/api/generations/'+id+'/source').json()['html']==HTML

@pytest.mark.parametrize('html',[HTML.replace('</head>','<script>alert(1)</script></head>'),HTML.replace('background:#eee5d7','background:url(https://evil.example/x)'),HTML.replace('</head>','<meta http-equiv="refresh" content="0;url=https://evil.example"></head>'),HTML.replace('2026-11-08','2030-01-01'),HTML.replace('<h1 ', '<h1 onclick="alert(1)" ')])
def test_dangerous_or_changed_facts_rejected(html):
 with pytest.raises(ValueError):validate_generated(html,BRIEF)

def test_changed_fact_is_restored_without_replacing_model_art(tmp_path,monkeypatch):
 app=build(tmp_path,monkeypatch,lambda req:result(HTML.replace('2026-11-08','2030-01-01')))
 with TestClient(app) as c:
  id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
  job=c.get('/api/generations/'+id).json();assert job['state']=='complete' and job['local_repairs']
  source=c.get('/api/generations/'+id+'/source').json()['html']
  assert '2026-11-08' in source and '2030-01-01' not in source and '#eee5d7' in source
  assert len(job['attempts'])==1
  assert c.get('/api/generations/'+id+'/image').status_code==200
  assert c.get('/api/status').json()['spent']>0

def test_network_failure_keeps_reservation_no_retry(tmp_path,monkeypatch):
 calls=[]
 def handler(req):calls.append(req);raise httpx.ReadTimeout('timeout',request=req)
 app=build(tmp_path,monkeypatch,handler)
 with TestClient(app) as c:
  id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
  assert c.get('/api/generations/'+id).json()['state']=='failed'
  c.post('/api/generations',json=REQUEST,headers=HEADERS)
  assert len(calls)==1 and c.get('/api/status').json()['reserved']==.1

def test_refresh_and_styles_do_not_call_provider(tmp_path,monkeypatch):
 app=build(tmp_path,monkeypatch,lambda req:pytest.fail('No paid request on reads'))
 with TestClient(app) as c:
  assert len(c.get('/api/styles').json()['styles'])==7
  assert c.get('/api/generations').json()==[]
  assert c.get('/api/generations/not-a-job/image').status_code==404

def test_real_renderer_checks_image_dimensions_and_overflow(tmp_path):
 fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
 report=render_document(validate_generated(HTML,BRIEF),1080,1440,tmp_path/'poster.png',fonts)
 assert report['width']==1080 and Image.open(tmp_path/'poster.png').size==(1080,1440)
 bad=HTML.replace('font-size:110px','font-size:110px;position:absolute;left:1500px')
 with pytest.raises(ValueError,match='超出'):
  render_document(bad,1080,1440,tmp_path/'bad.png',fonts)


def test_visible_font_ink_is_allowed_but_clipped_text_is_rejected(tmp_path):
 fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
 tight=HTML.replace('font-size:110px','font-size:110px;line-height:1.1')
 render_document(tight,1080,1440,tmp_path/'tight.png',fonts)
 clipped=HTML.replace('font-size:110px','font-size:110px;height:25px;overflow:hidden')
 with pytest.raises(ValueError,match='裁切'):
  render_document(clipped,1080,1440,tmp_path/'clipped.png',fonts)


def test_field_outside_poster_is_rejected():
 outside=HTML.replace('<p data-field="date">2026-11-08</p>','').replace('</main>','</main><p data-field="date">2026-11-08</p>')
 with pytest.raises(ValueError,match='画布内'):
  validate_generated(outside,BRIEF)


def test_text_overlap_uses_text_rects_not_empty_container_space(tmp_path):
 fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
 html=HTML.replace('p{font-size:32px;margin:30px 0}', 'p{font-size:32px;margin:0;line-height:1.2;position:absolute;height:120px} [data-field="date"]{top:400px} [data-field="venue"]{top:450px}')
 render_document(html,1080,1440,tmp_path/'spaced.png',fonts)
 with pytest.raises(ValueError,match='文字重叠'):
  render_document(html.replace('top:450px','top:400px'),1080,1440,tmp_path/'overlap.png',fonts)


def test_renderer_rejects_missing_title_size(tmp_path):
 fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
 with pytest.raises(ValueError,match='字号'):
  render_document(HTML.replace('font-size:110px','font-size:16px'),1080,1440,tmp_path/'tiny.png',fonts)


def test_renderer_supplies_readable_defaults_without_overriding_explicit_design(tmp_path):
 fonts=Path(__file__).resolve().parents[1]/'web/public/fonts'
 missing=HTML.replace('font-size:110px;','').replace('font-size:32px;','')
 report=render_document(missing,1080,1440,tmp_path/'defaults.png',fonts)
 assert report['width']==1080


def test_flagship_revision_uses_image_and_can_reimagine_without_old_html(tmp_path,monkeypatch):
 calls=[]
 def handler(req):calls.append(json.loads(req.content));return result()
 with TestClient(build(tmp_path,monkeypatch,handler,design_model='step-5-preview')) as c:
  first=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
  second=c.post('/api/generations',json={**REQUEST,'revision_of':first,'revision_mode':'reimagine','instruction':'全新方案'},headers={'Idempotency-Key':'reimagine-test-one'}).json()['id']
  j=c.get('/api/generations/'+second).json()
  assert j['state']=='complete' and j['reference_image_used'] and j['model']=='step-5-preview'
  assert calls[1]['reasoning_effort']=='high' and calls[1]['max_tokens']==65536
  parts=calls[1]['messages'][1]['content'];assert parts[1]['image_url']['url'].startswith('data:image/png;base64,')
  assert json.loads(parts[0]['text'])['已有设计HTML']==''
  assert j['cost'] is None and j['visual_delta']['changed_pixel_percent']==0
  assert (tmp_path/'generations'/second/'design-request.json').is_file()


def test_creative_static_svg_and_pseudo_elements_are_allowed_but_active_content_is_not():
 svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="ink"><stop stop-color="#f80"/></linearGradient></defs><path fill="url(#ink)" d="M0 0L400 0L200 300Z"/></svg>'
 good=HTML.replace('</main>',svg+'</main>').replace('</style>','#poster:before{content:"";position:absolute;border:2px solid red}@supports(display:grid){.decoration{display:grid}}</style>')
 validate_generated(good,BRIEF)
 for payload in ['<script>alert(1)</script>','<foreignObject><div>bad</div></foreignObject>','<image href="https://example.com/a.png"/>','<animate attributeName="x"/>','<path fill="url(https://example.com/a.svg)"/>']:
  with pytest.raises(ValueError):validate_generated(HTML.replace('</main>','<svg>'+payload+'</svg></main>'),BRIEF)


def test_local_rerender_recovers_transient_renderer_failure_without_another_api_call(tmp_path,monkeypatch):
 count={'api':0,'render':0}
 def handler(req):count['api']+=1;return result()
 def transient(html,w,h,path,fonts):
  count['render']+=1
  if count['render']<=3:raise ValueError('Temporary renderer failure')
  return fake_render(html,w,h,path,fonts)
 with TestClient(build(tmp_path,monkeypatch,handler,renderer=transient)) as c:
  id=c.post('/api/generations',json=REQUEST,headers=HEADERS).json()['id']
  assert c.get('/api/generations/'+id).json()['can_rerender']
  assert c.post('/api/generations/'+id+'/rerender',json={}).status_code==202
  assert c.get('/api/generations/'+id).json()['state']=='complete'
  assert count=={'api':3,'render':4}
  assert c.post('/api/generations/'+id+'/rerender',json={}).status_code==409


def test_native_html_output_retains_vector_code_without_json_escaping():
 from posterlab.generation import parse_design
 html=HTML.replace('</head>','<meta name="posterlab-plan" content="大胆重构主视觉"><meta name="posterlab-summary" content="原创插画"><meta name="posterlab-change" content="改用宋体标题"></head>')
 parsed=parse_design(html)
 assert parsed['html']==html and parsed['design_plan']=='大胆重构主视觉'
 assert parsed['changes']==['改用宋体标题']
 assert parse_design(json.dumps({'html':HTML}))['html']==HTML
