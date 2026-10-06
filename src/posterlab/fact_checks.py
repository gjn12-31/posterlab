import unicodedata,re
from .public_checks import check


def normalize(text,case_sensitive=True):
    value=re.sub(r'\s+',' ',unicodedata.normalize('NFKC',text)).strip()
    return value if case_sensitive else value.casefold()


def run_fact_checks(answer,report,stage='draft'):
    fields=report.geometry.get('fields',[]);result=[]
    for key,spec in answer.fields.items():
        found=[f for f in fields if f['field_id']==key]
        status='fail';observed=None
        if len(found)==1 and report.render_status=='rendered':
            f=found[0];observed=f['dom_text']
            choices=spec.allowed_forms if spec.match=='allowed_forms' else [spec.value]
            ok=normalize(observed,spec.case_sensitive) in [normalize(x,spec.case_sensitive) for x in choices]
            status='pass' if ok else 'fail'
            if ok and (f['hidden'] or f['effective_opacity']<=0 or not f['line_rects']):status='fail'
        result.append(check(f'content.{key}',stage,status,observed=observed,expected=spec.value,match=spec.match,provisional=not answer.source_review.confirmed))
    texts=' '.join(n['text'] for n in report.geometry.get('all_text_nodes',[]) if n['visible'])
    stale=[s for s in answer.forbidden_stale_dates if normalize(s) in normalize(texts)]
    result.append(check('content.no_stale_date',stage,'fail' if stale else ('pass' if report.render_status=='rendered' else 'unknown'),matched=stale))
    return result
