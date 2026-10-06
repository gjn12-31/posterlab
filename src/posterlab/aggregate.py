"""Pure local aggregation. Never imports providers or sends model requests."""
import csv,io,statistics
from pathlib import Path
from .storage import read_json,read_jsonl,write_json,atomic_text


def rate(n,d):return {'numerator':n,'denominator':d,'rate':n/d if d else None}


def paired_metrics(draft,revised):
    a={c['check_id']:c['status'] for c in draft};b={c['check_id']:c['status'] for c in revised}
    pairs=[(v,b[k]) for k,v in a.items() if k in b and v in ('pass','fail') and b[k] in ('pass','fail')]
    return {'repair':rate(sum(x=='fail' and y=='pass' for x,y in pairs),sum(x=='fail' for x,y in pairs)),'regression':rate(sum(x=='pass' and y=='fail' for x,y in pairs),sum(x=='pass' for x,y in pairs)),'excluded':len(a.keys()|b.keys())-len(pairs)}


def csv_text(rows):
    out=io.StringIO();writer=csv.DictWriter(out,fieldnames=list(dict.fromkeys(k for r in rows for k in r)))
    writer.writeheader();writer.writerows(rows);return '\ufeff'+out.getvalue()


def aggregate(config,run_ids=None,include_demo=False,experiment=None):
    root=config.path(config['paths']['runs']);run_dirs=[root/r for r in run_ids] if run_ids else sorted(root.glob('*'))
    stage_rows=[];paired=[];coverage={'planned':len(run_dirs),'attempted':0,'not_started':0,'excluded_demo':0,'excluded_personal':0}
    for folder in run_dirs:
        if not (folder/'run.json').exists():continue
        run=read_json(folder/'run.json')
        if run.get('purpose')=='personal' and run_ids is None:
            coverage['excluded_personal']+=1;coverage['planned']-=1;continue
        if experiment and run.get('experiment_id')!=experiment:continue
        if include_demo and run['mode']!='demo':continue
        if run['mode']=='demo' and not include_demo:coverage['excluded_demo']+=1;continue
        attempted=run['operations']['generate_draft']['status']!='pending'
        coverage['attempted' if attempted else 'not_started']+=1
        summary_path=folder/'evaluation/resolved_summary.json'
        summary=read_json(summary_path) if summary_path.exists() else {}
        meta=read_json(folder/'metadata.snapshot.json')
        for stage in ('draft','revised'):
            artifact=run['artifacts'][stage];item=summary.get(stage,{});checks=item.get('checks',[])
            facts=[x for x in checks if x['check_id'].startswith('content.') and x['check_id']!='content.no_stale_date']
            judge=(item.get('judge') or {}).get('report')
            png=artifact['status']=='rendered';critical=[c for c in checks if c['critical']]
            row={'run_id':run['run_id'],'task_id':run['task_id'],'event_id':meta['event_id'],'variant':meta['variant'],'mode':run['mode'],'stage':stage,'attempted':attempted,'artifact_status':artifact['status'],'critical_pass':bool(critical) and png and all(c['status']=='pass' for c in critical),'critical_unknown_count':sum(c['status']=='unknown' for c in critical),'facts_pass_count':sum(c['status']=='pass' for c in facts),'facts_total_count':len(read_json(folder/'task.snapshot.json')['required_fields']),'facts_unknown_count':sum(c['status']=='unknown' for c in facts) if facts else (len(read_json(folder/'task.snapshot.json')['required_fields']) if png else 0),'content_complete_count':sum(c['status']=='pass' and next((v['status'] for v in checks if v['check_id']=='visibility.'+c['check_id'].split('.',1)[1]),'unknown')=='pass' for c in facts),'png_path':str(folder/artifact['png']) if artifact['png'] else None,'html_path':str(folder/artifact['html']) if artifact['html'] else None}
            for dim in ('readability','hierarchy','layout','style'):row[dim]=judge['visual_scores'][dim]['score'] if judge else None
            row['experiment_id']=run.get('experiment_id')
            row['service_status']=run['operations']['generate_draft' if stage=='draft' else 'revise_once']['status']
            render_path=folder/stage/'render.json'
            row['render_seconds']=read_json(render_path)['duration_seconds'] if render_path.exists() else None
            generation_path=folder/'requests'/stage/'response.json'
            row['generation_seconds']=read_json(generation_path)['latency_seconds'] if generation_path.exists() else None
            stage_rows.append(row)
        metrics=paired_metrics(summary.get('draft',{}).get('checks',[]),summary.get('revised',{}).get('checks',[]))
        paired.append({'run_id':run['run_id'],'task_id':run['task_id'],'event_id':meta['event_id'],'variant':meta['variant'],'repair_n':metrics['repair']['numerator'],'repair_d':metrics['repair']['denominator'],'repair_rate':metrics['repair']['rate'],'regression_n':metrics['regression']['numerator'],'regression_d':metrics['regression']['denominator'],'regression_rate':metrics['regression']['rate'],'excluded_checks':metrics['excluded'],'delivery_recovered':run['artifacts']['draft']['status']!='rendered' and run['artifacts']['revised']['status']=='rendered','delivery_lost':run['artifacts']['draft']['status']=='rendered' and run['artifacts']['revised']['status']!='rendered'})
    for pair in paired:
        a=next(r for r in stage_rows if r['run_id']==pair['run_id'] and r['stage']=='draft')
        b=next(r for r in stage_rows if r['run_id']==pair['run_id'] and r['stage']=='revised')
        for dim in ('readability','hierarchy','layout','style'):
            pair[dim+'_delta']=b[dim]-a[dim] if a[dim] is not None and b[dim] is not None else None
    summary={'schema_version':'1.0','scope':'offline_demo' if include_demo else 'live_only','coverage':coverage,'stages':{}}
    for stage in ('draft','revised'):
        rows=[r for r in stage_rows if r['stage']==stage and r['attempted']]
        summary['stages'][stage]={'delivery':rate(sum(r['artifact_status']=='rendered' for r in rows),len(rows)),'critical':rate(sum(r['critical_pass'] for r in rows),len(rows)),'facts':rate(sum(r['facts_pass_count'] for r in rows),sum(r['facts_total_count'] for r in rows)),'unknown':sum(r['critical_unknown_count'] for r in rows)}
    summary['paired']={'repair':rate(sum(r['repair_n'] for r in paired),sum(r['repair_d'] for r in paired)),'regression':rate(sum(r['regression_n'] for r in paired),sum(r['regression_d'] for r in paired))}
    ids={r['run_id'] for r in paired}
    ledger_path=config.path(config['paths']['ledger'])/'attempts.json'
    costs=[r for r in (read_json(ledger_path) if ledger_path.exists() else []) if any(r['logical_call_id'].startswith(i+'-') for i in ids)]
    summary['costs']={c:{'known_estimate':sum(r['cost_estimate'] for r in costs if r['currency']==c and r['cost_estimate'] is not None),'unknown_attempts':sum(r['currency']==c and r['cost_estimate'] is None for r in costs)} for c in ('CNY','USD')}
    summary['request_attempts']=len(costs)
    for row in stage_rows:
        ids_for_stage={row['run_id']+'-'+row['stage'],row['run_id']+'-judge-'+row['stage']}
        attempts=[c for c in costs if c['logical_call_id'] in ids_for_stage]
        row['request_attempts']=len(attempts)
        row['executor_logical_calls']=len({c['logical_call_id'] for c in attempts if c['role']=='executor'})
        row['judge_logical_calls']=len({c['logical_call_id'] for c in attempts if c['role']=='judge'})
        row['cost_unknown_attempts']=sum(c['cost_estimate'] is None for c in attempts)
        for currency in ('CNY','USD'):
            part=[c for c in attempts if c['currency']==currency]
            row['cost_'+currency]=sum(c['cost_estimate'] for c in part) if part and all(c['cost_estimate'] is not None for c in part) else None
    summary['by_variant']={}
    for variant in sorted({r['variant'] for r in paired}):
        subset=[r for r in paired if r['variant']==variant]
        item={'runs':len(subset),'events':len({r['event_id'] for r in subset}),'repair':rate(sum(r['repair_n'] for r in subset),sum(r['repair_d'] for r in subset)),'regression':rate(sum(r['regression_n'] for r in subset),sum(r['regression_d'] for r in subset)),'visual_change':{}}
        for dim in ('readability','hierarchy','layout','style'):
            values=[r[dim+'_delta'] for r in subset if r[dim+'_delta'] is not None]
            item['visual_change'][dim]={'comparable_pairs':len(values),'median_delta':statistics.median(values) if values else None}
        summary['by_variant'][variant]=item
    out=config.path('artifacts/reports')/(experiment or ('demo' if include_demo else 'live'));out.mkdir(parents=True,exist_ok=True)
    atomic_text(out/'stage_results.csv',csv_text(stage_rows));atomic_text(out/'paired_results.csv',csv_text(paired));write_json(out/'summary.json',summary)
    return summary,out
