import copy,json
from pathlib import Path
import pytest,httpx
from posterlab.storage import inside,read_json,write_json,dumps
from posterlab.tasks import load_public_task,load_answer_spec,validate_data
from posterlab.html_contract import extract_html,validate_html
from posterlab.fixtures import fixture_html
from posterlab.schemas import ModelRequest,CheckResult,ModelResponse
from posterlab.providers import call_model,payload_for,ProviderError
from posterlab.budget import Budget,BudgetError
from posterlab.prompt_builder import build_generate_request,build_revise_request
from posterlab.public_checks import build_public_feedback
from posterlab.judge import parse_judge
from posterlab.aggregate import paired_metrics,rate


def test_dataset_and_variants(config):
    result=validate_data(config);assert result['valid'] and result['events']==10 and result['tasks']==30
    assert not validate_data(config,formal=True)['valid']
    for i in range(1,11):
        eid=f'e{i:03d}';standard=load_answer_spec(eid+'-standard',config);update=load_answer_spec(eid+'-update',config);long=load_answer_spec(eid+'-long',config)
        assert [k for k in standard.fields if standard.fields[k]!=update.fields[k]]==['date']
        assert [k for k in standard.fields if standard.fields[k]!=long.fields[k]]==['description']
        assert len(long.fields['description'].value)>1.5*len(standard.fields['description'].value)


def test_paths(tmp_path):
    with pytest.raises(ValueError):inside(tmp_path,'../secret')
    (tmp_path/'escape').symlink_to('/tmp')
    with pytest.raises(ValueError):inside(tmp_path,'escape/secret')


def test_contract(config):
    task,_=load_public_task('e001-standard',config);html=fixture_html(task,True)
    assert validate_html(extract_html(html),task)['valid']
    for bad in [html.replace('</head>','<script>alert(1)</script></head>'),html.replace('assets/logo.png','https://example.com/a.png'),html.replace('</style>',"@import 'bad.css';</style>"),html.replace('body{','body{background:u\\72l(https://x);')]:
        assert not validate_html(bad,task)['valid']
    with pytest.raises(ValueError):extract_html('explanation'+html)
    with pytest.raises(ValueError):extract_html('```html\n'+html+'\n```\n```html\n'+html+'\n```')


def test_feedback_isolation(config,tmp_path):
    task,root=load_public_task('e001-standard',config);prompts={'executor_system':'s','generate_user':'g','revise_user':'r'}
    (tmp_path/'response.txt').write_text(fixture_html(task))
    request=build_generate_request(task,root,prompts,'x')
    revised=build_revise_request(task,root,tmp_path,[],prompts,'y')
    assert 'answer_path' not in dumps(request) and 'source_review' not in dumps(revised)
    assert request.images and revised.images
    with pytest.raises(ValueError):build_public_feedback([CheckResult(check_id='content.date',stage='draft',status='fail',evidence={'expected':'SECRET_SENTINEL'})])


def setup_provider(config,monkeypatch):
    config.data['models']['executor']['model']='fixture-model';monkeypatch.setenv('DASHSCOPE_API_KEY','test-secret')
    return ModelRequest(role='executor',logical_call_id='test',purpose='test',system='s',text='t')


def test_retry_accounting(config,monkeypatch,tmp_path):
    request=setup_provider(config,monkeypatch);calls=[]
    def handler(req):
        calls.append(req)
        return httpx.Response(429,headers={'Retry-After':'0'}) if len(calls)==1 else httpx.Response(200,json={'id':'r','model':'actual','choices':[{'message':{'content':'done'},'finish_reason':'stop'}],'usage':{'prompt_tokens':7}})
    result=call_model(request,config,Budget(config),tmp_path/'request',transport=httpx.MockTransport(handler))
    assert result.text=='done' and len(calls)==2
    assert len(Budget(config).records())==2
    assert 'test-secret' not in ''.join(p.read_text() for p in (tmp_path/'request').glob('*.json'))


def test_401_no_retry(config,monkeypatch,tmp_path):
    req=setup_provider(config,monkeypatch);calls=[]
    def handler(r):calls.append(r);return httpx.Response(401)
    with pytest.raises(ProviderError):call_model(req,config,Budget(config),tmp_path/'r',transport=httpx.MockTransport(handler))
    assert len(calls)==1 and len(Budget(config).records())==1


def test_budget_and_payload(config,monkeypatch,tmp_path):
    req=setup_provider(config,monkeypatch);config.data['limits']['max_attempts_total']=0
    with pytest.raises(BudgetError):call_model(req,config,Budget(config),tmp_path/'r',transport=httpx.MockTransport(lambda r:pytest.fail('HTTP must not be sent')))
    task,root=load_public_task('e001-standard',config);req=build_generate_request(task,root,{'executor_system':'s','generate_user':'g'},'i')
    q=payload_for(req,config['models']['executor']);a=payload_for(req,config['models']['judge'])
    assert q['messages'][1]['content'][2]['image_url']['url'].startswith('data:image/png;base64,')
    assert a['messages'][0]['content'][2]['source']['type']=='base64'


def test_unknown_not_zero_and_transitions():
    def checks(states):return [{'check_id':k,'status':v} for k,v in states.items()]
    m=paired_metrics(checks({'a':'fail','b':'fail','c':'pass','d':'unknown'}),checks({'a':'pass','b':'fail','c':'fail','d':'pass'}))
    assert m['repair']['rate']==.5 and m['regression']['rate']==1 and m['excluded']==1
    assert rate(0,0)['rate'] is None


def test_invalid_judge():
    with pytest.raises(ValueError):parse_judge('{}',['date'],'a')


def test_judge_schema_rejects_missing_duplicate_and_out_of_range():
    score={'score':3,'evidence':'清晰可见'}
    raw={'artifact_id':'anon-1','fields':[{'field_id':'date','observed_text':'x','correctness':'correct','visibility':'readable','evidence':'下部日期可见'}],'visual_scores':{k:score.copy() for k in ['readability','hierarchy','layout','style']},'major_issues':[]}
    assert parse_judge(json.dumps(raw),['date'],'anon-1')
    with pytest.raises(ValueError):parse_judge(json.dumps(raw),['date','title'],'anon-1')
    raw['fields'].append(raw['fields'][0])
    with pytest.raises(ValueError):parse_judge(json.dumps(raw),['date'],'anon-1')
    raw['fields']=raw['fields'][:1];raw['visual_scores']['layout']['score']=6
    with pytest.raises(ValueError):parse_judge(json.dumps(raw),['date'],'anon-1')


def test_truncation_and_no_content_retry(config,monkeypatch,tmp_path):
    req=setup_provider(config,monkeypatch);calls=[]
    def handler(r):calls.append(r);return httpx.Response(200,json={'choices':[{'message':{'content':'partial'},'finish_reason':'length'}]})
    response=call_model(req,config,Budget(config),tmp_path/'r',transport=httpx.MockTransport(handler))
    assert response.truncated and len(calls)==1


def test_formal_budget_reserves_before_http(config,monkeypatch,tmp_path):
    req=setup_provider(config,monkeypatch);lim=config.data['limits'];lim['prices_confirmed']=True;lim['money_caps']['CNY']=1;lim['reservations']['executor']=.75
    budget=Budget(config);budget.reserve(req,1,pilot=False)
    with pytest.raises(BudgetError):budget.reserve(req,2,pilot=False)


def test_freeze_requires_real_review(config):
    from posterlab.batch import freeze
    with pytest.raises(ValueError,match='双人'):freeze(config,'test-frozen')
