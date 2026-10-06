from __future__ import annotations
import random,shutil,uuid
from pathlib import Path
from filelock import FileLock
from .config import Config
from .schemas import RunRecord,Operation,StageArtifact,PublicTask,AnswerSpec,RenderReport,CheckResult,ModelResponse
from .storage import safe_id,read_json,write_json,atomic_text,append_jsonl,read_jsonl,directory_hash,file_hash,dumps,sha256,now
from .tasks import load_public_task,load_answer_spec,metadata
from .budget import Budget,BudgetError
from .providers import call_model,validate_model_config,ProviderError
from .prompt_builder import build_generate_request,build_revise_request
from .html_contract import extract_html,validate_html
from .renderer import render_html,EnvironmentError
from .public_checks import run_public_checks,build_public_feedback
from .fact_checks import run_fact_checks
from .judge import build_judge_request,parse_judge
from .adjudication import resolve_checks
from .fixtures import fixture_html


class Pipeline:
    def __init__(self,config):self.config=config
    def directory(self,run_id):return self.config.path(self.config['paths']['runs'])/safe_id(run_id)
    def load(self,run_id):return RunRecord.model_validate(read_json(self.directory(run_id)/'run.json'))
    def save(self,run):write_json(self.directory(run.run_id)/'run.json',run)
    def snapshot(self,run_id):
        root=self.directory(run_id);hashes=read_json(root/'hashes.json')
        for name,digest in hashes.items():
            path=root/name;actual=directory_hash(path) if path.is_dir() else file_hash(path)
            if actual!=digest:raise ValueError(f'运行快照已变化: {name}')
        config=Config(read_json(root/'config.snapshot.json'),self.config.root)
        task=PublicTask.model_validate(read_json(root/'task.snapshot.json'))
        return root,config,task,read_json(root/'prompts.snapshot.json')
    def create_run(self,task_id,mode='demo',experiment_id=None):
        if mode not in ('demo','dev','test'):raise ValueError('未知运行模式')
        if mode=='test':
            from .batch import verify_freeze
            if not experiment_id:raise ValueError('正式运行需要 experiment_id')
            verify_freeze(self.config,experiment_id)
        task,public_root=load_public_task(task_id,self.config);meta=metadata(task_id,self.config)
        if mode=='dev' and meta.split!='dev':raise ValueError('真实开发调用仅允许开发集，避免污染测试集')
        return self._create_run(task,public_root,load_answer_spec(task_id,self.config),meta,mode,experiment_id)
    def create_personal_run(self,fields,theme='paper',mode='demo'):
        if mode not in ('demo','dev'):raise ValueError('个人作品不能进入正式实验')
        from .studio import make_personal_task
        from .schemas import TaskMetadata
        from tempfile import TemporaryDirectory
        base,public_root=load_public_task('e001-standard',self.config)
        task_id='personal-'+uuid.uuid4().hex[:10]
        task,answer=make_personal_task(task_id,fields,theme,base.assets)
        with TemporaryDirectory() as tmp:
            public=Path(tmp)/'public';shutil.copytree(public_root,public)
            for name,text in task.sources.items():atomic_text(public/name,text)
            atomic_text(public/'brief.md',task.brief)
            write_json(public/'task.json',task.model_dump(exclude={'brief','sources','assets'}))
            meta=TaskMetadata(task_id=task_id,event_id=task_id,variant='standard',split='dev',public_dir='public',answer_path='answer.snapshot.json',public_sha256=directory_hash(public),answer_sha256=sha256(dumps(answer)),source_url='')
            return self._create_run(task,public,answer,meta,mode,None,purpose='personal')
    def _create_run(self,task,public_root,answer,meta,mode,experiment_id,purpose='benchmark'):
        task_id=task.task_id
        rid=now().replace('-','').replace(':','').split('.')[0].lower()+'-'+task_id+'-'+uuid.uuid4().hex[:6]
        root=self.directory(rid);root.mkdir(parents=True)
        config=self.config.data;prompts={p.stem:p.read_text(encoding='utf-8') for p in sorted((self.config.root/'prompts').glob('*.txt'))}
        write_json(root/'config.snapshot.json',config);write_json(root/'task.snapshot.json',task);write_json(root/'prompts.snapshot.json',prompts);write_json(root/'metadata.snapshot.json',meta)
        # Stored outside public input; only loaded by evaluate_run after revision.
        write_json(root/'answer.snapshot.json',answer)
        shutil.copytree(public_root,root/'public')
        for key in ('regular_font','bold_font'):
            target=root/config['render'][key];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(self.config.path(config['render'][key]),target)
        shutil.copy2(self.config.root/'resources/fonts/LICENSE.txt',root/'resources/fonts/LICENSE.txt')
        atomic_text(root/'rubric.snapshot.md',(self.config.root/'docs/rubric.md').read_text())
        names=['config.snapshot.json','task.snapshot.json','prompts.snapshot.json','metadata.snapshot.json','answer.snapshot.json','rubric.snapshot.md','public','resources/fonts']
        hashes={name:directory_hash(root/name) if (root/name).is_dir() else file_hash(root/name) for name in names}
        write_json(root/'hashes.json',hashes)
        run=RunRecord(purpose=purpose,run_id=rid,task_id=task_id,mode=mode,experiment_id=experiment_id,created_at=now(),config_sha256=hashes['config.snapshot.json'],prompt_sha256=hashes['prompts.snapshot.json'],public_task_sha256=hashes['public'],operations={k:Operation() for k in ['generate_draft','revise_once','evaluate_draft','evaluate_revised']},artifacts={s:StageArtifact() for s in ('draft','revised')})
        self.save(run);append_jsonl(root/'events.jsonl',{'at':now(),'event':'created','mode':mode});return run
    def verify_artifact(self,run_id,stage):
        root=self.directory(run_id)/stage
        path=root/'artifact.hashes.json'
        if path.exists():
            for name,digest in read_json(path).items():
                if file_hash(root/name)!=digest:raise ValueError('产物 hash 不符: '+stage+'/'+name)
    def recover_response(self,request_dir,config,role):
        path=request_dir/'response.json';raw=request_dir/'response.raw.json'
        if not path.exists() and raw.exists():
            from .providers import parse_response
            write_json(path,parse_response(read_json(raw),config['models'][role],None))
        return path.exists()
    def _process(self,run,stage,response,root,config,task):
        out=root/stage;out.mkdir(exist_ok=True)
        if (out/'artifact.hashes.json').exists():
            for name,digest in read_json(out/'artifact.hashes.json').items():
                if file_hash(out/name)!=digest:raise ValueError('已保存产物发生变化，禁止覆盖')
        atomic_text(out/'response.txt',response.text)
        artifact=StageArtifact(status='contract_failed');contract={'valid':False,'errors':[]}
        try:
            if response.truncated:raise ValueError('输出截断；不得自动续写')
            html=extract_html(response.text);atomic_text(out/'poster.html',html);artifact.html=f'{stage}/poster.html'
            contract=validate_html(html,task);write_json(out/'contract.json',contract)
            if not contract['valid']:raise ValueError('；'.join(contract['errors']))
        except ValueError as error:
            contract['valid']=False;contract['errors'].append(str(error));write_json(out/'contract.json',contract)
            report=RenderReport(render_status='render_failed',errors=contract['errors']);artifact.error=str(error)
        else:
            report=render_html(out/'poster.html',task,root/'public',config,out,fonts_root=root)
            artifact.status=report.render_status
            if report.render_status=='rendered':artifact.png=f'{stage}/poster.png'
            else:artifact.error='；'.join(report.errors)
        write_json(out/'render.json',report)
        checks=run_public_checks(task,report,stage,contract)
        write_json(out/'public_checks.json',[c.model_dump(mode='json') for c in checks]);write_json(out/'public_feedback.json',build_public_feedback(checks))
        write_json(out/'artifact.hashes.json',{p.name:file_hash(p) for p in out.iterdir() if p.is_file() and p.name!='artifact.hashes.json'})
        run.artifacts[stage]=artifact
    def _design(self,run_id,stage):
        root=self.directory(run_id)
        with FileLock(str(root/'.run.lock'),timeout=0):
            run=self.load(run_id);key='generate_draft' if stage=='draft' else 'revise_once';op=run.operations[key]
            if op.status=='complete':
                self.verify_artifact(run_id,stage);return run
            if op.status in ('failed','unknown_remote_state'):raise ValueError('本操作已消耗；不可重发。需要原因明确的新开发运行')
            if stage=='revised' and run.operations['generate_draft'].status!='complete':raise ValueError('初稿响应处理完毕后才允许修改')
            root,config,task,prompts=self.snapshot(run_id);request_dir=root/'requests'/stage
            response_path=request_dir/'response.json'
            self.recover_response(request_dir,config,'executor')
            if stage=='revised':self.verify_artifact(run_id,'draft')
            if op.status=='running' and not response_path.exists():
                op.status='unknown_remote_state';run.status='unknown_remote_state';self.save(run);return run
            if run.mode!='demo' and not response_path.exists():validate_model_config(config,'executor')
            op.status='running';op.logical_call_id=run_id+'-'+stage;run.status=stage+'_request_started';self.save(run)
            try:
                if response_path.exists():response=ModelResponse.model_validate(read_json(response_path))
                else:
                    if stage=='draft':request=build_generate_request(task,root/'public',prompts,op.logical_call_id)
                    else:
                        checks=[CheckResult.model_validate(c) for c in read_json(root/'draft/public_checks.json')]
                        request=build_revise_request(task,root/'public',root/'draft',checks,prompts,op.logical_call_id)
                    if run.mode=='demo':
                        write_json(request_dir/'request.redacted.json',{'mode':'demo','sent':False,'request':request.model_dump(mode='json')})
                        from .studio import studio_html
                        code=studio_html(task,revised=stage=='revised') if run.purpose=='personal' else fixture_html(task,revised=stage=='revised')
                        response=ModelResponse(text=code,model='local-handwritten-fixture',stop_reason='fixture_complete')
                        write_json(response_path,response)
                    else:response=call_model(request,config,Budget(config),request_dir,pilot=run.mode!='test')
                self._process(run,stage,response,root,config,task)
                op.status='complete';op.error=None;run.status=stage+'_processed'
            except BudgetError as e:
                op.status='interrupted';op.error=str(e);run.status='interrupted_budget';self.save(run);raise
            except EnvironmentError as e:
                op.status='running';op.error=str(e);run.status='environment_error';self.save(run);raise
            except ProviderError as e:
                op.status='unknown_remote_state' if e.kind=='unknown_remote_state' else 'failed';op.error=str(e);run.status=e.kind;self.save(run);raise
            except Exception as e:
                # A local failure after response storage is recoverable without another request.
                op.status='running';op.error=str(e);run.status='local_processing_interrupted';self.save(run);raise
            self.save(run);append_jsonl(root/'events.jsonl',{'at':now(),'event':run.status,'artifact_status':run.artifacts[stage].status});return run
    def generate_draft(self,run_id):return self._design(run_id,'draft')
    def revise_once(self,run_id):return self._design(run_id,'revised')
    def evaluate_run(self,run_id,stages=None):
        root=self.directory(run_id)
        with FileLock(str(root/'.run.lock'),timeout=0):
            run=self.load(run_id)
            if run.operations['revise_once'].status!='complete':raise ValueError('修改处理结束后才能读取答案并评测')
            if run.status=='complete':return run
            root,config,task,prompts=self.snapshot(run_id);answer=AnswerSpec.model_validate(read_json(root/'answer.snapshot.json'))
            order=list(stages) if stages is not None else ['draft','revised']
            if not set(order)<= {'draft','revised'}:raise ValueError('无效评审阶段')
            if stages is None:random.Random(config['experiment']['judge_shuffle_seed']).shuffle(order)
            write_json(root/'evaluation/order.json',order)
            for stage in order:
                op=run.operations['evaluate_'+stage];out=root/stage;request_dir=root/'requests'/('judge-'+stage)
                self.verify_artifact(run_id,stage)
                self.recover_response(request_dir,config,'judge')
                if op.status in ('complete','failed','unknown_remote_state'):continue
                if op.status=='running' and not (request_dir/'response.json').exists():
                    op.status='unknown_remote_state';op.error='评审请求可能已执行，禁止自动重发';self.save(run);continue
                report=RenderReport.model_validate(read_json(out/'render.json'))
                checks=run_fact_checks(answer,report,stage);write_json(out/'fact_checks.json',[c.model_dump(mode='json') for c in checks])
                if not run.artifacts[stage].png:
                    write_json(out/'judge.json',{'status':'skipped_no_image','report':None});op.status='complete';self.save(run);continue
                if run.mode=='demo':
                    write_json(out/'judge.json',{'status':'not_run_offline','report':None,'reason':'离线演示未调用视觉模型；不伪造分数'});op.status='complete';self.save(run);continue
                validate_model_config(config,'judge')
                op.status='running';op.logical_call_id=run_id+'-judge-'+stage;self.save(run)
                anon_path=request_dir/'artifact.json'
                anon=read_json(anon_path)['id'] if anon_path.exists() else 'anon-'+uuid.uuid4().hex[:10]
                write_json(anon_path,{'id':anon})
                try:
                    if (request_dir/'response.json').exists():response=ModelResponse.model_validate(read_json(request_dir/'response.json'))
                    else:
                        request=build_judge_request(out/'poster.png',task,answer,prompts,(root/'rubric.snapshot.md').read_text(),anon,op.logical_call_id)
                        response=call_model(request,config,Budget(config),request_dir,pilot=run.mode!='test')
                    if response.truncated:raise ValueError('评审输出截断')
                    result=parse_judge(response.text,task.required_fields,anon)
                    write_json(out/'judge.json',{'status':'valid','report':result.model_dump(mode='json')});op.status='complete'
                except BudgetError as e:
                    op.status='interrupted';op.error=str(e);run.status='interrupted_budget';self.save(run);raise
                except ProviderError as e:
                    op.status='unknown_remote_state' if e.kind=='unknown_remote_state' else 'failed';op.error=str(e)
                    write_json(out/'judge.json',{'status':e.kind,'report':None});self.save(run)
                    if e.kind in ('permission_error','configuration_error'):raise
                except ValueError as e:
                    op.status='complete';write_json(out/'judge.json',{'status':'invalid_response','report':None,'error':str(e)})
                self.save(run)
            summary={}
            for stage in ['draft','revised']:
                out=root/stage
                checks=read_json(out/'public_checks.json')+(read_json(out/'fact_checks.json') if (out/'fact_checks.json').exists() else [])
                judge=read_json(out/'judge.json') if (out/'judge.json').exists() else {'status':'unknown_remote_state','report':None}
                summary[stage]={'checks':resolve_checks(checks,judge['report']),'judge':judge,'artifact_status':run.artifacts[stage].status}
            write_json(root/'evaluation/raw_summary.json',summary)
            import copy
            resolved=copy.deepcopy(summary)
            for override in read_jsonl(root/'evaluation/human_overrides.jsonl'):
                for c in resolved[override['stage']]['checks']:
                    if c['check_id']==override['check_id']:
                        c['status']=override['final_status'];c['evidence']['human_override']=override
            write_json(root/'evaluation/resolved_summary.json',resolved)
            run.status='complete' if all(run.operations['evaluate_'+s].status in ('complete','failed','unknown_remote_state') for s in ('draft','revised')) else 'evaluation_started'
            self.save(run);return run
    def resume(self,run_id):
        run=self.load(run_id)
        if run.status=='complete':return run
        for key,fn in [('generate_draft',self.generate_draft),('revise_once',self.revise_once)]:
            if run.operations[key].status!='complete':
                run=fn(run_id)
                if run.operations[key].status!='complete':return run
        return self.evaluate_run(run_id)
    def run_all(self,task_id,mode='demo'):
        run=self.create_run(task_id,mode);return self.resume(run.run_id)
