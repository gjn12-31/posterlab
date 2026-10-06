import argparse,sys,uuid
from pathlib import Path
from .config import load_config,doctor
from .storage import dumps,write_json,atomic_text


def main():
    parser=argparse.ArgumentParser(description='PosterLab · 离线验证与受限两次调用工作流')
    sub=parser.add_subparsers(dest='command',required=True)
    for name in ['doctor','validate-data','render-fixture','smoke','run','inspect','resume','export','batch','freeze','aggregate','report','audit-sample']:
        p=sub.add_parser(name);p.add_argument('--config',default='configs/dev.yaml')
        if name in ('run','render-fixture'):p.add_argument('--task',default='e001-standard')
        if name=='run':p.add_argument('--mode',choices=['demo','dev'],default='demo')
        if name in ('inspect','resume','export'):p.add_argument('--run',required=True)
        if name=='export':p.add_argument('--stage',choices=['draft','revised'],default='revised')
        if name=='render-fixture':p.add_argument('--name',default='valid');p.add_argument('--out',default='work/fixture-valid')
        if name=='smoke':p.add_argument('--role',choices=['executor','judge'],required=True)
        if name=='validate-data':p.add_argument('--manifest');p.add_argument('--formal',action='store_true')
        if name=='batch':p.add_argument('--batch-id',required=True);p.add_argument('--split',choices=['dev','test'],default='dev');p.add_argument('--phase',choices=['execute','judge','all'],default='all')
        if name in ('freeze','audit-sample'):p.add_argument('--experiment',required=True)
        if name=='batch':p.add_argument('--experiment')
        if name in ('aggregate','report'):
            p.add_argument('--include-demo',action='store_true');p.add_argument('--experiment')
    args=parser.parse_args();config=load_config(args.config)
    try:
        from .pipeline import Pipeline
        pipe=Pipeline(config)
        if args.command=='doctor':result=doctor(config);write_json(config.path('artifacts/environment.json'),result)
        elif args.command=='validate-data':
            from .tasks import validate_data
            if args.manifest:config.data['paths']['manifest']=args.manifest
            result=validate_data(config,args.formal)
            print(dumps(result));return 0 if result['valid'] else 1
        elif args.command=='run':result=pipe.run_all(args.task,args.mode)
        elif args.command=='inspect':result=pipe.load(args.run)
        elif args.command=='resume':result=pipe.resume(args.run)
        elif args.command=='export':
            from .export import export_poster
            result={'zip':str(export_poster(pipe,args.run,args.stage))}
        elif args.command=='render-fixture':
            from .fixtures import fixture_html
            from .tasks import load_public_task
            from .renderer import render_html
            from .html_contract import validate_html
            from .public_checks import run_public_checks
            task,root=load_public_task(args.task,config);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
            code=fixture_html(task,True,args.name);atomic_text(out/'poster.html',code);contract=validate_html(code,task)
            if not contract['valid']:raise ValueError('; '.join(contract['errors']))
            report=render_html(out/'poster.html',task,root,config,out)
            write_json(out/'public_checks.json',[c.model_dump(mode='json') for c in run_public_checks(task,report)])
            result={'status':report.render_status,'png':str(out/'poster.png'),'errors':report.errors}
        elif args.command=='smoke':
            from .schemas import ModelRequest
            from .tasks import load_public_task
            from .prompt_builder import image_input
            from .providers import call_model
            from .budget import Budget
            task,root=load_public_task('e001-standard',config);rid='smoke-'+uuid.uuid4().hex[:8]
            request=ModelRequest(role=args.role,logical_call_id=rid,purpose='smoke',system='你是图片理解助手。',text='简要描述附图的形状与颜色。',images=[image_input(root/task.assets[0].path,'测试图片')])
            result=call_model(request,config,Budget(config),config.path('artifacts/smoke')/rid)
        elif args.command=='batch':
            from .batch import batch_run
            result=batch_run(config,args.batch_id,args.split,args.phase,args.experiment)
        elif args.command=='audit-sample':
            from .batch import audit_sample
            result=audit_sample(config,args.experiment)
        elif args.command=='freeze':
            from .batch import freeze
            result=freeze(config,args.experiment)
        elif args.command in ('aggregate','report'):
            from .aggregate import aggregate
            result,out=aggregate(config,include_demo=args.include_demo,experiment=args.experiment)
            if args.command=='report':
                import html
                atomic_text(out/'report.html','<!doctype html><meta charset="utf-8"><title>PosterLab report</title><style>body{max-width:1000px;margin:50px auto;font:16px system-ui;color:#14264b}pre{white-space:pre-wrap;background:#f1f5fc;padding:24px}</style><h1>PosterLab 实验摘要</h1><p>离线演示与真实实验分开统计；未知分数和费用不视为零。</p><pre>'+html.escape(dumps(result))+'</pre>')
        print(dumps(result));return 0
    except Exception as e:
        print(f'{type(e).__name__}: {e}',file=sys.stderr);return 1

if __name__=='__main__':raise SystemExit(main())
