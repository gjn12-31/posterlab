from .storage import read_json,read_jsonl,write_json,append_jsonl,now


def resolve_checks(checks,judge,overrides=()):
    output={c['check_id']:dict(c) for c in checks}
    for key,item in list(output.items()):
        if key.startswith('visibility.') and item['status']=='pass':
            item['status']='unknown';item['evidence']={**item['evidence'],'reason':'DOM 可见性通过；独立视觉可见性待确认'}
    if judge:
        for f in judge['fields']:
            for key,value in [('visibility.'+f['field_id'],{'readable':'pass','unreadable':'fail','missing':'fail','unknown':'unknown'}[f['visibility']]),('content.'+f['field_id'],{'correct':'pass','incorrect':'fail','missing':'fail','unknown':'unknown'}[f['correctness']])]:
                if key not in output:continue
                item=output[key];old=item['status'];raw=next(c['status'] for c in checks if c['check_id']==key)
                item['evidence']={**item['evidence'],'judge_status':value,'judge_evidence':f['evidence']}
                if raw=='fail':item['status']='fail'
                elif raw=='pass' and value=='pass':item['status']='pass'
                elif raw=='pass' and value=='fail':item['status']='unknown';item['evidence']['conflict']=True
                elif key.startswith('visibility.') and value=='fail':item['status']='fail'
                else:item['status']='unknown'
    for o in overrides:
        if o['check_id'] in output:
            item=output[o['check_id']]
            item['evidence']={**item['evidence'],'human_override':o};item['status']=o['final_status']
    return list(output.values())


def write_override(run_dir,stage,check_id,status,reviewer,reason):
    if stage not in ('draft','revised') or status not in ('pass','fail','unknown'):raise ValueError('无效裁定')
    if not reviewer.strip() or not reason.strip():raise ValueError('需填写复核人及证据')
    path=run_dir/'evaluation/raw_summary.json'
    if not path.exists():raise ValueError('评测后才能复核')
    raw=read_json(path);checks=raw[stage]['checks']
    item=next((x for x in checks if x['check_id']==check_id),None)
    if not item:raise ValueError('检查项不存在')
    append_jsonl(run_dir/'evaluation/human_overrides.jsonl',{'stage':stage,'check_id':check_id,'original_status':item['status'],'final_status':status,'reviewer':reviewer.strip(),'reason':reason.strip(),'reviewed_at':now()})
    resolved=read_json(path)
    for s in ('draft','revised'):
        overrides=[x for x in read_jsonl(run_dir/'evaluation/human_overrides.jsonl') if x['stage']==s]
        # raw_summary already contains fused raw checks; apply human decisions separately.
        for o in overrides:
            for c in resolved[s]['checks']:
                if c['check_id']==o['check_id']:c['status']=o['final_status'];c['evidence']['human_override']=o
    write_json(run_dir/'evaluation/resolved_summary.json',resolved)
