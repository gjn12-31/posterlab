import time
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from PIL import Image
from playwright.sync_api import sync_playwright
from .schemas import RenderReport
from .storage import atomic_text, write_json, inside


class EnvironmentError(RuntimeError): pass


def render_html(html_path, task, asset_root, config, out_dir, fonts_root=None):
    out_dir=Path(out_dir);out_dir.mkdir(parents=True,exist_ok=True)
    started=time.perf_counter(); blocked=[];errors=[]
    fonts_root=Path(fonts_root) if fonts_root else config.root
    font_paths={name:fonts_root / config['render'][key] for name,key in [('regular.otf','regular_font'),('bold.otf','bold_font')]}
    for p in font_paths.values():
        if not p.is_file(): raise EnvironmentError(f'字体缺失: {p.name}')
    html=Path(html_path).read_text(encoding='utf-8')
    soup=BeautifulSoup(html,'html.parser')
    style=soup.new_tag('style')
    style.string='''@font-face{font-family:PosterSans;src:url('fonts/regular.otf');font-weight:400;font-display:block;}@font-face{font-family:PosterSans;src:url('fonts/bold.otf');font-weight:700;font-display:block;}html,body{margin:0;padding:0;color-scheme:light;font-family:PosterSans;}*,*::before,*::after{box-sizing:border-box;animation:none!important;transition:none!important;}'''
    if not soup.head: raise ValueError('head 缺失')
    soup.head.append(style)
    render_path=out_dir/'poster.render.html';atomic_text(render_path,str(soup))
    mapping={'https://poster.local/poster.html':(render_path,'text/html')}
    mapping.update({'https://poster.local/'+a.path:(inside(Path(asset_root),a.path),a.mime_type) for a in task.assets})
    mapping.update({'https://poster.local/fonts/'+name:(p,'font/otf') for name,p in font_paths.items()})
    geometry={};browser_version=None
    with sync_playwright() as p:
        try: browser=p.chromium.launch()
        except Exception as e: raise EnvironmentError('Chromium 不可用，请运行 playwright install chromium') from e
        try:
            browser_version=browser.version
            ctx=browser.new_context(viewport={'width':task.canvas.width,'height':task.canvas.height},device_scale_factor=1,locale='zh-CN',timezone_id='Asia/Shanghai',color_scheme='light',service_workers='block',accept_downloads=False)
            def route_handler(route):
                item=mapping.get(route.request.url)
                if item and item[0].is_file():
                    route.fulfill(path=item[0],content_type=item[1],headers={'Content-Security-Policy':"default-src 'none'; img-src 'self'; font-src 'self'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"})
                else:
                    blocked.append(route.request.url);route.abort()
            ctx.route('**/*',route_handler)
            page=ctx.new_page();page.set_default_timeout(config['render']['timeout_seconds']*1000)
            page.on('popup',lambda pop:pop.close())
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto('https://poster.local/poster.html',wait_until='load')
            page.evaluate('document.fonts.ready')
            loaded=page.evaluate("async()=>{await document.fonts.load('24px PosterSans');await document.fonts.load('700 24px PosterSans');return [...document.fonts].every(f=>f.status==='loaded')}")
            if not loaded: raise EnvironmentError('固定字体未加载，停止运行')
            page.wait_for_function('Array.from(document.images).every(i=>i.complete)')
            geometry=page.evaluate(Path(__file__).with_name('collect_geometry.js').read_text())
            geometry['blocked_requests']=blocked
            if any(f['transform'] for f in geometry['fields']): raise ValueError('关键字段或祖先存在 transform/rotate/scale')
            box=page.locator('#poster').bounding_box()
            if abs(box['width']-task.canvas.width)>.5 or abs(box['height']-task.canvas.height)>.5:
                raise ValueError(f'画布实际尺寸 {box["width"]}×{box["height"]} 不符合约定')
            page.screenshot(path=str(out_dir/'poster.png'),clip={'x':box['x'],'y':box['y'],'width':task.canvas.width,'height':task.canvas.height},animations='disabled')
            with Image.open(out_dir/'poster.png') as img:
                width,height=img.size
                if (width,height)!=(task.canvas.width,task.canvas.height): raise ValueError('PNG 尺寸错误')
            report=RenderReport(render_status='rendered',png_path='poster.png',width=width,height=height,geometry=geometry,errors=errors,blocked_requests=blocked,browser_version=browser_version)
        except EnvironmentError: raise
        except Exception as e:
            report=RenderReport(render_status='render_failed',geometry=geometry,errors=errors+[str(e)],blocked_requests=blocked,browser_version=browser_version)
        finally: browser.close()
    report.duration_seconds=time.perf_counter()-started
    write_json(out_dir/'geometry.json',geometry);write_json(out_dir/'render.json',report)
    return report
