"""Frozen formal experiments and separate, resumable offline batches."""
import random,shutil,subprocess
from pathlib import Path
from filelock import FileLock
from .storage import read_json,read_jsonl,write_json,atomic_text,safe_id,directory_hash,file_hash,now
from .tasks import validate_data
from .pipeline import Pipeline
from .config import doctor

FREEZE_PATHS=['configs/dev.yaml','prompts','docs/rubric.md','data','resources/fonts','requirements.lock.txt','src/posterlab','app.py','ui','scripts']


def freeze_hash(config,path):
    # Python runtime caches are not source code and must not affect a freeze.
    from .storage import sha256,dumps
    root=config.path(path)
    if root.is_file():return file_hash(root)
    return sha256(dumps({p.relative_to(root).as_posix():file_hash(p) for p in sorted(root.rglob('*')) if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}))


def freeze(config,experiment):
    safe_id(experiment);report=validate_data(config,formal=True)
    if not report['valid']:raise ValueError('不能冻结：'+ '; '.join(report['errors'][:3]))
    limits=config['limits']
    if not limits['prices_confirmed'] or any(limits['money_caps'][limits['currency'][r]] is None or not limits['reservations'][r] for r in ('executor','judge')):raise ValueError('不能冻结：定价与预算待确认')
    accepted=config.path('artifacts/calibration/accepted.json')
    if not accepted.exists():raise ValueError('不能冻结：缺少双人评审校准验收')
    approval=read_json(accepted)
    if not approval.get('passed') or len(set(approval.get('reviewers',[])))<2 or approval.get('valid_judgments',0)<10:raise ValueError('校准验收不完整')
    from .providers import validate_model_config
    for role in ('executor','judge'):validate_model_config(config,role)
    destination=config.path('artifacts/freezes')/experiment
    if destination.exists():raise ValueError('实验 ID 已存在，不覆盖冻结档案')
    environment=doctor(config)
    if not environment['browser']['installed'] or not all(f['exists'] for f in environment['fonts'].values()):raise ValueError('渲染环境缺失')
    destination.mkdir(parents=True)
    hashes={name:freeze_hash(config,name) for name in FREEZE_PATHS}
    for name in FREEZE_PATHS:
        source=config.path(name);target=destination/'snapshot'/name;target.parent.mkdir(parents=True,exist_ok=True)
        if source.is_dir():shutil.copytree(source,target,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        else:shutil.copy2(source,target)
    git={}
    for key,args in [('commit',['rev-parse','HEAD']),('dirty',['status','--porcelain']),('patch',['diff','HEAD'])]:
        p=subprocess.run(['git',*args],cwd=config.root,capture_output=True,text=True);git[key]=p.stdout if p.returncode==0 else None
    write_json(destination/'freeze.json',{'schema_version':'1.0','experiment_id':experiment,'created_at':now(),'hashes':hashes,'environment':environment,'git':git,'config':config.data,'calibration':approval})
    return {'experiment_id':experiment,'path':str(destination)}


def verify_freeze(config,experiment):
    safe_id(experiment);path=config.path('artifacts/freezes')/experiment/'freeze.json'
    if not path.exists():raise ValueError('实验未冻结')
    frozen=read_json(path)
    for name,digest in frozen['hashes'].items():
        if freeze_hash(config,name)!=digest:raise ValueError('冻结后文件变化: '+name)
    if config.data!=frozen['config']:raise ValueError('配置与冻结版本不符')
    return frozen


def batch_run(config,batch_id,split='dev',phase='all',experiment=None):
    safe_id(batch_id);mode='test' if experiment else 'demo'
    if experiment:verify_freeze(config,experiment)
    folder=config.path('artifacts/batches')/batch_id;folder.mkdir(parents=True,exist_ok=True)
    with FileLock(str(folder/'.batch.lock'),timeout=0):
        path=folder/'manifest.json';pipe=Pipeline(config)
        if path.exists():
            rows=read_json(path)
            if any(r['mode']!=mode or r.get('experiment_id')!=experiment or r.get('split')!=split for r in rows):raise ValueError('不能混用批次模式、集合或实验 ID')
        else:
            tasks=[r for r in read_jsonl(config.path(config['paths']['manifest'])) if r['split']==split]
            rows=[{'task_id':r['task_id'],'event_id':r['event_id'],'variant':r['variant'],'run_id':None,'status':'not_started','mode':mode,'split':split,'experiment_id':experiment} for r in tasks];write_json(path,rows)
        if phase in ('execute','all'):
            for row in rows:
                try:
                    if row['run_id'] is None:row['run_id']=pipe.create_run(row['task_id'],mode,experiment).run_id;write_json(path,rows)
                    run=pipe.load(row['run_id'])
                    if run.operations['generate_draft'].status in ('failed','unknown_remote_state'):continue
                    run=pipe.generate_draft(row['run_id'])
                    if run.operations['generate_draft'].status=='complete':run=pipe.revise_once(row['run_id'])
                    row['status']=run.status;write_json(path,rows)
                except Exception as e:
                    row['status']=pipe.load(row['run_id']).status if row['run_id'] else 'not_started';row['error']=str(e);write_json(path,rows);raise
        if phase in ('judge','all'):
            order_path=folder/'judge_order.json'
            if order_path.exists():order=read_json(order_path)
            else:
                order=[{'run_id':r['run_id'],'stage':s} for r in rows if r['run_id'] for s in ('draft','revised')]
                random.Random(config['experiment']['judge_shuffle_seed']).shuffle(order);write_json(order_path,order)
            for item in order:
                run=pipe.load(item['run_id'])
                if run.operations['revise_once'].status!='complete':continue
                run=pipe.evaluate_run(run.run_id,stages=[item['stage']])
                for row in rows:
                    if row['run_id']==run.run_id:row['status']=run.status
                write_json(path,rows)
        return rows


def batch_demo(config,batch_id,split='dev',phase='all'):
    return batch_run(config,batch_id,split,phase)


def audit_sample(config,experiment):
    verify_freeze(config,experiment)
    groups={};mandatory={};rng=random.Random(config['experiment']['audit_seed'])
    for path in sorted(config.path('runs').glob('*/run.json')):
        run=read_json(path)
        if run['experiment_id']!=experiment:continue
        meta=read_json(path.parent/'metadata.snapshot.json')
        summary_path=path.parent/'evaluation/raw_summary.json'
        if not summary_path.exists():continue
        for stage,item in read_json(summary_path).items():
            if item['artifact_status']!='rendered':continue
            row={'run_id':run['run_id'],'stage':stage,'variant':meta['variant']};key=(run['run_id'],stage)
            groups.setdefault((meta['variant'],stage),[]).append(row)
            if any(c['status']=='unknown' or c['evidence'].get('conflict') for c in item['checks']):mandatory[key]={**row,'audit_reason':['unknown_or_conflict']}
    import math
    for group in groups.values():
        for row in rng.sample(group,max(1,math.ceil(len(group)*config['experiment']['human_audit_fraction']))):
            key=(row['run_id'],row['stage']);mandatory.setdefault(key,{**row,'audit_reason':[]})['audit_reason'].append('random_sample')
    rows=list(mandatory.values());write_json(config.path('artifacts/reports')/experiment/'audit_sample.json',rows);return rows
