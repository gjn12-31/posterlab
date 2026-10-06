"""Check a feasible developer layout for every task, without any model request."""
from pathlib import Path
from posterlab.config import load_config
from posterlab.tasks import load_public_task
from posterlab.storage import read_jsonl,atomic_text,write_json
from posterlab.fixtures import fixture_html
from posterlab.renderer import render_html
from posterlab.public_checks import run_public_checks
root=Path(__file__).resolve().parents[1];config=load_config(root/'configs/dev.yaml');results=[]
for row in read_jsonl(config.path(config['paths']['manifest'])):
    task,assets=load_public_task(row['task_id'],config);folder=root/'work/feasibility'/task.task_id
    atomic_text(folder/'poster.html',fixture_html(task,True))
    report=render_html(folder/'poster.html',task,assets,config,folder)
    issues=[c.model_dump(mode='json') for c in run_public_checks(task,report) if c.status!='pass']
    results.append({'task_id':task.task_id,'status':report.render_status,'issues':issues})
    print(task.task_id,report.render_status,[(x['check_id'],x['status']) for x in issues],flush=True)
write_json(root/'artifacts/feasibility.json',results)
