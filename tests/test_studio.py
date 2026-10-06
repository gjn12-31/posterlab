from pathlib import Path
import pytest
from posterlab.studio import DEFAULT_FIELDS,THEMES,make_personal_task,public_fields,studio_html
from posterlab.pipeline import Pipeline
from posterlab.tasks import load_public_task
from posterlab.storage import directory_hash,read_json
from posterlab.html_contract import validate_html
from posterlab.aggregate import aggregate


def test_personal_creation_isolated_and_themes_render(config):
    before=directory_hash(config.root/'data')
    pipe=Pipeline(config)
    for theme in THEMES:
        fields={**DEFAULT_FIELDS,'title':'周末设计分享 <灵感>'}
        run=pipe.create_personal_run(fields,theme)
        root=pipe.directory(run.run_id)
        assert run.purpose=='personal'
        _,_,task,_=pipe.snapshot(run.run_id)
        assert public_fields(task)==fields
        assert THEMES[theme]['brief'] in task.brief
        assert validate_html(studio_html(task),task)['valid']
        run=pipe.generate_draft(run.run_id)
        assert run.artifacts['draft'].status=='rendered'
        assert all(c['status']=='pass' for c in read_json(root/'draft/public_checks.json'))
        code=(root/'draft/poster.html').read_text()
        assert '&lt;灵感&gt;' in code and THEMES[theme]['background'] in code
    assert directory_hash(config.root/'data')==before
    summary,_=aggregate(config,include_demo=True)
    assert summary['coverage']['attempted']==0


def test_personal_optimize_evaluate_and_resume(config):
    pipe=Pipeline(config);run=pipe.create_personal_run(DEFAULT_FIELDS,'paper')
    pipe.generate_draft(run.run_id);pipe.revise_once(run.run_id);run=pipe.evaluate_run(run.run_id)
    assert run.status=='complete'
    root=pipe.directory(run.run_id)
    assert all(c['status']=='pass' for c in read_json(root/'revised/fact_checks.json'))
    assert read_json(root/'revised/judge.json')['status']=='not_run_offline'
    assert pipe.resume(run.run_id).status=='complete'


def test_invalid_personal_brief_does_not_create_run(config):
    pipe=Pipeline(config)
    with pytest.raises(ValueError,match='请填写标题'):
        pipe.create_personal_run({**DEFAULT_FIELDS,'title':''})
    assert not config.path(config['paths']['runs']).exists()
