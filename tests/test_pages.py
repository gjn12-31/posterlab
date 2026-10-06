"""Exercise the actual GitHub Pages interface, storage and PNG export."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def pages_server():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(ROOT / 'site')))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown()
    server.server_close()

@pytest.fixture
def page(pages_server):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width': 1440, 'height': 1100})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(pages_server)
        page.wait_for_function("document.querySelector('#sample').options.length === 11")
        yield page
        assert not errors
        browser.close()

def test_pages_create_optimize_download_reopen(page, tmp_path):
    page.locator('#title').fill('属于我的设计分享会')
    page.get_by_role('button', name='蓝调学术', exact=False).click()
    page.get_by_role('button', name='制作海报', exact=False).last.click()
    page.wait_for_function("JSON.parse(localStorage.getItem('posterlab.works.v1')).length === 1")
    page.locator('#optimize').click()
    assert page.locator('#versions').is_visible()
    page.locator('#original').click()
    assert '原版' in page.locator('#preview-label').inner_text()
    page.locator('#revised').click()
    with page.expect_download() as download:
        page.locator('#download').click()
    path = tmp_path / 'poster.png'
    download.value.save_as(path)
    assert Image.open(path).size == (1080, 1440)
    page.reload()
    page.get_by_role('button', name='我的作品', exact=True).click()
    assert page.locator('.work-card').count() == 1
    page.get_by_role('button', name='继续编辑', exact=True).click()
    assert page.locator('#title').input_value() == '属于我的设计分享会'
    assert page.locator('[data-theme="blue"]').get_attribute('aria-pressed') == 'true'
    assert page.locator('#versions').is_visible()

def test_pages_sources_validation_and_safe_text(page):
    for i in range(1,11):
        page.locator('#sample').select_option(f'e{i:03}')
        assert page.locator('#title').input_value()
        assert page.locator('#source-link').get_attribute('href').startswith('https://iiis.tsinghua.edu.cn/')
    page.locator('#title').fill('   ')
    page.locator('.create').click()
    assert page.evaluate("localStorage.getItem('posterlab.works.v1')") is None
    page.locator('#sample').select_option('')
    page.locator('#title').fill('<img src=x onerror=alert(1)>')
    page.locator('.create').click()
    page.get_by_role('button', name='我的作品', exact=True).click()
    assert page.locator('.work-card h2').inner_text() == '<img src=x onerror=alert(1)>'
    assert page.locator('.work-card h2 img').count() == 0

def test_pages_mobile_layout(page):
    page.set_viewport_size({'width':390,'height':844})
    for button in ['我的作品','使用帮助','制作海报']:
        page.get_by_role('button', name=button, exact=True).click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('#poster').bounding_box()['width'] <= 350
    for style in ['paper','blue','sage']:
        page.locator(f'[data-theme="{style}"]').click()
        assert page.locator('#download').is_enabled()
