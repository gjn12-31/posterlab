"""Generate known-error developer calibration fixtures; sends zero API requests."""
from pathlib import Path
from posterlab.config import load_config
from posterlab.tasks import load_public_task
from posterlab.fixtures import fixture_html
from posterlab.renderer import render_html
from posterlab.storage import atomic_text,write_json

root=Path(__file__).resolve().parents[1];config=load_config(root/'configs/dev.yaml');task,assets=load_public_task('e001-standard',config)
manifest=[]
for name,fault,expected in [('baseline','valid',[]),('wrong_date','wrong_date',['content.date']),('missing_venue','valid',['structure.venue.unique']),('tiny_description','tiny_child',['layout.font_min.description']),('covered','occluded',['visibility.title'])]:
    code=fixture_html(task,True,fault)
    if name=='missing_venue':
        from bs4 import BeautifulSoup
        soup=BeautifulSoup(code,'html.parser');soup.select_one('[data-field="venue"]').decompose();code=str(soup)
    folder=root/'artifacts/calibration'/name;atomic_text(folder/'poster.html',code)
    report=render_html(folder/'poster.html',task,assets,config,folder)
    manifest.append({'fixture':name,'expected_issues':expected,'render_status':report.render_status,'human_confirmed':False,'judge_calls':0})
write_json(root/'artifacts/calibration/manifest.json',manifest)
print('5 calibration fixtures generated. Human verification and 10 judge calls pending.')
