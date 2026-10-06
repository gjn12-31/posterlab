from pathlib import Path
import pytest
from posterlab.pipeline import Pipeline
from posterlab.tasks import load_public_task,load_answer_spec
from posterlab.fixtures import fixture_html
from posterlab.storage import atomic_text,read_json,write_json,file_hash
from posterlab.renderer import render_html,EnvironmentError
from posterlab.public_checks import run_public_checks
from posterlab.fact_checks import run_fact_checks
from posterlab.schemas import ModelResponse
from posterlab.export import export_poster


def test_real_render_checks(config,tmp_path):
    task,root=load_public_task('e001-standard',config)
    for fault,expected in [('valid',None),('hidden','visibility.description'),('overflow','layout.bounds.description'),('clip','layout.clip.description'),('tiny_child','layout.font_min.description')]:
        out=tmp_path/fault;atomic_text(out/'poster.html',fixture_html(task,True,fault))
        report=render_html(out/'poster.html',task,root,config,out)
        assert report.render_status=='rendered' and (report.width,report.height)==(1080,1440)
        checks={c.check_id:c for c in run_public_checks(task,report)}
        if expected:assert checks[expected].status=='fail'
        else:assert all(c.status=='pass' for c in checks.values())


def test_pipeline_idempotency_and_export(config):
    pipe=Pipeline(config);run=pipe.create_run('e001-update');root=pipe.directory(run.run_id)
    with pytest.raises(ValueError):pipe.evaluate_run(run.run_id)
    run=pipe.generate_draft(run.run_id);digest=file_hash(root/'draft/poster.png')
    pipe.generate_draft(run.run_id);assert file_hash(root/'draft/poster.png')==digest
    run=pipe.revise_once(run.run_id);pipe.revise_once(run.run_id)
    run=pipe.evaluate_run(run.run_id);assert run.status=='complete'
    assert read_json(root/'revised/judge.json')['report'] is None
    assert not config.path(config['paths']['ledger']).exists()
    facts=read_json(root/'revised/fact_checks.json');assert all(c['status']=='pass' for c in facts)
    assert pipe.resume(run.run_id).status=='complete'
    package=export_poster(pipe,run.run_id)
    import zipfile
    with zipfile.ZipFile(package) as z:
        assert 'poster.html' in z.namelist() and 'fonts/regular.otf' in z.namelist()
        assert not any('answer' in p or '.env' in p for p in z.namelist())


def test_recovery_never_resends_unknown(config):
    pipe=Pipeline(config);run=pipe.create_run('e001-standard');run.operations['generate_draft'].status='running';pipe.save(run)
    run=pipe.generate_draft(run.run_id)
    assert run.operations['generate_draft'].status=='unknown_remote_state'
    assert not (pipe.directory(run.run_id)/'requests/draft/response.json').exists()


def test_saved_response_recovery_and_failed_revision(config):
    pipe=Pipeline(config);run=pipe.create_run('e001-standard');root=pipe.directory(run.run_id)
    task,_=load_public_task(run.task_id,config)
    run.operations['generate_draft'].status='running';pipe.save(run)
    write_json(root/'requests/draft/response.json',ModelResponse(text=fixture_html(task,True),model='fixture'))
    assert pipe.generate_draft(run.run_id).artifacts['draft'].status=='rendered'
    write_json(root/'requests/revised/response.json',ModelResponse(text='invalid',model='fixture'))
    run=pipe.revise_once(run.run_id)
    assert run.artifacts['revised'].status=='contract_failed' and run.artifacts['revised'].png is None
    assert (root/'draft/poster.png').exists()


def test_missing_font_stops_environment(config,tmp_path):
    config.data['render']['regular_font']='missing.otf';task,root=load_public_task('e001-standard',config)
    atomic_text(tmp_path/'poster.html',fixture_html(task,True))
    with pytest.raises(EnvironmentError):render_html(tmp_path/'poster.html',task,root,config,tmp_path/'out')


def test_two_single_image_evaluations_update_resolved(config):
    pipe=Pipeline(config);run=pipe.create_run('e001-standard');pipe.generate_draft(run.run_id);pipe.revise_once(run.run_id)
    run=pipe.evaluate_run(run.run_id,stages=['revised']);assert run.status=='evaluation_started'
    run=pipe.evaluate_run(run.run_id,stages=['draft']);assert run.status=='complete'
    summary=read_json(pipe.directory(run.run_id)/'evaluation/resolved_summary.json')
    assert all(summary[s]['judge']['status']=='not_run_offline' for s in ('draft','revised'))


def test_raw_response_recovery_and_hash_integrity(config):
    pipe=Pipeline(config);run=pipe.create_run('e001-standard');root=pipe.directory(run.run_id);task,_=load_public_task(run.task_id,config)
    run.operations['generate_draft'].status='running';pipe.save(run)
    write_json(root/'requests/draft/response.raw.json',{'choices':[{'message':{'content':fixture_html(task,True)},'finish_reason':'stop'}]})
    assert pipe.generate_draft(run.run_id).artifacts['draft'].status=='rendered'
    atomic_text(root/'draft/poster.html','tampered')
    with pytest.raises(ValueError,match='hash'):pipe.revise_once(run.run_id)


def test_stale_date_outside_date_field(config,tmp_path):
    task,root=load_public_task('e001-update',config);answer=load_answer_spec(task.task_id,config)
    code=fixture_html(task,True).replace('</main>',f'<p style="position:absolute;bottom:100px">{answer.forbidden_stale_dates[0]}</p></main>')
    atomic_text(tmp_path/'poster.html',code);report=render_html(tmp_path/'poster.html',task,root,config,tmp_path/'out')
    results={c.check_id:c.status for c in run_fact_checks(answer,report)}
    assert results['content.date']=='pass' and results['content.no_stale_date']=='fail'


def test_aggregate_delivery_failure_and_unknown(config):
    from posterlab.aggregate import aggregate
    pipe=Pipeline(config)
    run=pipe.create_run('e001-standard');root=pipe.directory(run.run_id)
    pipe.generate_draft(run.run_id)
    write_json(root/'requests/revised/response.json',ModelResponse(text='bad HTML',model='fixture'))
    pipe.revise_once(run.run_id);pipe.evaluate_run(run.run_id)
    summary,_=aggregate(config,[run.run_id],include_demo=True)
    assert summary['stages']['draft']['delivery']['numerator']==1
    assert summary['stages']['revised']['delivery']['numerator']==0
    assert summary['stages']['draft']['critical']['numerator']==0
    assert summary['by_variant']['standard']['visual_change']['layout']['median_delta'] is None
    assert summary['request_attempts']==0
    excluded,_=aggregate(config,[run.run_id],include_demo=False)
    assert excluded['coverage']['excluded_demo']==1 and excluded['stages']['draft']['delivery']['denominator']==0
