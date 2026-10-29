"""Build downloadable example packages after the static Pages build, without credentials."""
import json
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
site=Path(sys.argv[1]) if len(sys.argv)>1 else root/'site';demo=site/'demo'
routes=json.loads((demo/'manifest.json').read_text())
for job in routes['/generations']:
    id=job['id']
    with ZipFile(demo/(id+'.zip'),'w',ZIP_DEFLATED) as z:
        z.write(demo/(id+'-poster.html'),'poster.html')
        z.write(demo/(id+'.png'),'poster.png')
        z.write(demo/(id+'-design-request.json'),'design-request.json')
        z.writestr('generation.json',json.dumps(job,ensure_ascii=False,indent=2))
        for name,target in [('PosterSans-Regular.woff2','regular.woff2'),('PosterSans-Bold.woff2','bold.woff2'),('PosterSerif-Regular.woff2','serif.woff2'),('PosterDisplay-Regular.woff2','display.woff2'),('LICENSE.txt','LICENSE.txt'),('PosterSerif-LICENSE.txt','Serif-LICENSE.txt'),('PosterDisplay-LICENSE.txt','Display-LICENSE.txt'),('SOURCE.txt','SOURCE.txt')]:
            z.write(site/'fonts'/name,'fonts/'+target)
        z.write(site/'library'/'sparkles-ivory.png','assets/sparkles-ivory.png')
        z.write(site/'library'/'LICENSE.txt','assets/LICENSE.txt')
print('Built',len(routes['/generations']),'recorded example packages')
