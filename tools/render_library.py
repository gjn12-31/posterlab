"""Rasterize the bundled, trusted SVG library for the isolated poster renderer."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, PngImagePlugin
root=Path(__file__).resolve().parents[1]/'web/public/library'
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for item in json.loads((root/'catalog.json').read_text()):
        width,height=(256,256) if item['kind']=='icon' else (1080,1440)
        page=browser.new_page(viewport={'width':width,'height':height},java_script_enabled=False)
        svg=(root/(item['id']+'.svg')).read_text()
        page.route('**/*',lambda route:route.abort())
        page.set_content('<html><head><style>html,body{margin:0}</style></head><body>'+svg+'</body></html>')
        dest=root/(item['id']+'.png');page.screenshot(path=str(dest),omit_background=True);page.close()
        info=PngImagePlugin.PngInfo();info.add_text('License',(root/'LICENSE.txt').read_text() if item['kind']=='icon' else 'CC0 1.0 - PosterLab original background');info.add_text('Source',item['source_url'] or 'PosterLab')
        with Image.open(dest) as im:im.save(dest,pnginfo=info,optimize=True)
    browser.close()
print('Rasterized library PNGs with embedded license metadata')
