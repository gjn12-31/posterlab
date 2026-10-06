from .schemas import CheckResult


def check(check_id,stage,status,**evidence):
    return CheckResult(check_id=check_id,stage=stage,status=status,evidence=evidence)


def in_bounds(rect,canvas):
    return rect['x']>=-.5 and rect['y']>=-.5 and rect['x']+rect['width']<=canvas['width']+.5 and rect['y']+rect['height']<=canvas['height']+.5


def run_public_checks(task,report,stage='draft',contract=None):
    result=[check('delivery.html_contract',stage,'pass' if not contract or contract['valid'] else 'fail',errors=(contract or {}).get('errors',[])),check('delivery.png',stage,'pass' if report.render_status=='rendered' else 'fail',errors=report.errors)]
    g=report.geometry;canvas=g.get('canvas',{})
    result.append(check('delivery.canvas_size',stage,'pass' if report.width==task.canvas.width and report.height==task.canvas.height else 'fail',observed=canvas))
    for field in task.required_fields:
        items=[f for f in g.get('fields',[]) if f['field_id']==field]
        result.append(check(f'structure.{field}.unique',stage,'pass' if len(items)==1 else 'fail',count=len(items)))
        if len(items)!=1:
            result.append(check(f'visibility.{field}',stage,'fail',message='缺少唯一可检查字段'))
            continue
        f=items[0];minimum=task.minimum_font_px['title' if field=='title' else 'body']
        result.append(check(f'layout.font_min.{field}',stage,'pass' if f['min_descendant_font_px']>=minimum else 'fail',observed=f['min_descendant_font_px'],required_min=minimum))
        result.append(check(f'layout.font_family.{field}',stage,'pass' if 'PosterSans' in f['font_family'] else 'fail',observed=f['font_family']))
        result.append(check(f'layout.bounds.{field}',stage,'pass' if all(in_bounds(r,canvas) for r in [f['rect']]+f['line_rects']) else 'fail',rect=f['rect'],line_rects=f['line_rects']))
        result.append(check(f'layout.clip.{field}',stage,'fail' if f['clipping_candidates'] else ('unknown' if f['complex_effect'] else 'pass'),candidates=f['clipping_candidates']))
        hidden=f['hidden'] or f['effective_opacity']<=0 or not f['line_rects']
        visibility='fail' if hidden else ('unknown' if f['occlusion_candidates'] or f['complex_effect'] or f['effective_opacity']<.99 else 'pass')
        result.append(check(f'visibility.{field}',stage,visibility,hidden=hidden,opacity=f['effective_opacity'],occlusion_candidates=f['occlusion_candidates'],origin='dom'))
    for asset in task.assets:
        items=[a for a in g.get('assets',[]) if a['asset_id']==asset.asset_id]
        ok=len(items)==1 and items[0]['complete'] and items[0]['natural_width']>0 and items[0]['rect']['width']>0 and items[0]['rect']['height']>0 and not items[0]['hidden'] and items[0]['effective_opacity']>0
        result.append(check(f'assets.{asset.asset_id}.loaded',stage,'pass' if ok else 'fail',observed=items))
        if ok:
            a=items[0];ratio=a['rect']['width']/a['rect']['height'];natural=a['natural_width']/a['natural_height']
            fit=a['object_fit'] in ('contain','scale-down') or (asset.crop_allowed and a['object_fit']=='cover') or abs(ratio-natural)<.01
            result.append(check(f'assets.{asset.asset_id}.fit',stage,'pass' if fit else 'fail',object_fit=a['object_fit']))
            result.append(check(f'assets.{asset.asset_id}.bounds',stage,'pass' if in_bounds(a['rect'],canvas) else 'fail',rect=a['rect']))
    return result


def build_public_feedback(checks):
    allowed=('delivery.','assets.','structure.','layout.','visibility.')
    for c in checks:
        if not c.check_id.startswith(allowed) or c.evidence.get('origin')=='judge': raise ValueError('禁止将答案或评审反馈给执行模型')
    return {'schema_version':'1.0','feedback_type':'observable_structure_only','issues':[c.model_dump(mode='json') for c in checks if c.status=='fail'],'uncertain_layout_observations':[c.model_dump(mode='json') for c in checks if c.status=='unknown']}
