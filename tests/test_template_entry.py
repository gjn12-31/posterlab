"""Exercise the finished poster, direct manipulation, and export in a browser."""
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from zipfile import ZipFile

import pytest
from PIL import Image
from playwright.sync_api import expect, sync_playwright

SITE = Path(__file__).resolve().parents[1] / "site"


@pytest.fixture
def studio():
    handler = partial(SimpleHTTPRequestHandler, directory=SITE)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch()
                yield browser, f"http://127.0.0.1:{server.server_port}/"
                browser.close()
        finally:
            server.shutdown()
            thread.join()


def test_mobile_first_poster_and_local_resume(studio, tmp_path):
    browser, url = studio
    page = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    page.goto(url)
    page.get_by_role("button", name="使用这张模板").tap()
    canvas = page.locator(".cs-art")
    expect(canvas.get_by_text("深海回响", exact=True)).to_be_visible()
    expect(page.locator(".cs-inspector")).to_have_count(0)
    with page.expect_download() as download:
        page.get_by_role("button", name="下载 PNG").tap()
    dest = tmp_path / "cover.png"
    download.value.save_as(dest)
    with Image.open(dest) as image:
        assert image.format == "PNG" and image.size == (1920, 1080)
    title = canvas.locator('[data-layer="title"]')
    title.tap()
    page.get_by_label("修改图层文字").fill("微光放映夜")
    expect(title).to_have_text("微光放映夜")
    page.wait_for_function("location.hash==='#studio/landscape'")
    page.get_by_role("button", name="我的作品").tap()
    page.get_by_role("button",name="打开作品 微光放映夜").tap()
    expect(canvas.get_by_text("微光放映夜")).to_be_visible()
    page.reload()
    expect(canvas.get_by_text("微光放映夜")).to_be_visible()


def test_title_proof_drag_history_and_material_pack(studio):
    browser, url = studio
    page = browser.new_page(viewport={"width": 1360, "height": 880})
    page.goto(url)
    page.get_by_role("button", name="试排我的标题").click()
    page.get_by_label("海报标题").fill("植物开放日")
    assert page.locator(".sr-card-sheet").get_by_text("植物开放日").count() == 4
    page.get_by_role("button", name="使用植物图鉴模板").click()
    page.locator('.cs-art [data-layer="title"]').click()
    page.get_by_role("button", name="添加自由文字").click()
    page.get_by_label("修改图层文字").fill("仅此一日")
    note = page.locator('.cs-art g[data-layer^="note-"]')
    page.get_by_role("button",name="收起工具").click()
    original = note.get_attribute("transform")
    box = note.bounding_box()
    cx, cy = box["x"] + box["width"]/2, box["y"] + box["height"]/2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx+65, cy+50, steps=8)
    page.mouse.up()
    moved = note.get_attribute("transform")
    assert moved != original
    page.get_by_role("button",name="撤销",exact=True).click()
    expect(note).to_have_attribute("transform", original)
    page.get_by_role("button",name="重做",exact=True).click()
    expect(note).to_have_attribute("transform", moved)
    page.get_by_role("button",name="1:1",exact=True).click()
    assert note.get_attribute("transform") != moved
    page.get_by_role("button",name="3:4",exact=True).click()
    expect(note).to_have_attribute("transform", moved)
    page.get_by_role("button",name="创作助手",exact=True).click()
    page.get_by_role("button",name="让活动标题更醒目").click()
    expect(page.get_by_role("dialog")).to_contain_text("本地规则")
    page.get_by_role("button",name="应用到整套物料").click()
    page.get_by_role("button",name="更多导出格式").click()
    page.get_by_role("button",name="整套活动包").click()
    with page.expect_download() as download:
        page.get_by_role("button",name="下载作品").click()
    with ZipFile(download.value.path()) as archive:
        snapshot = json.loads(archive.read("project.posterlab.json"))["current"]
        assert snapshot["edition"] == "bloom" and snapshot["titleScale"] > 1
        assert snapshot["brief"]["date"] == "" and snapshot["notes"][0]["text"] == "仅此一日"
        assert snapshot["notes"][0]["id"] in snapshot["layerStyles"]["portrait"]
        sizes = sorted(Image.open(archive.open(n)).size for n in archive.namelist() if n.endswith(".png"))
        assert sizes == [(1080, 1080), (1080, 1440), (1920, 1080)]
    page.get_by_role("button",name="更多导出格式").click()
    page.get_by_role("button",name="可编辑 SVG").click()
    with page.expect_download() as download:
        page.get_by_role("button",name="下载作品").click()
    svg = Path(download.value.path()).read_text()
    assert moved in svg and "仅此一日" in svg and "data:image/webp;base64," in svg


def test_ai_rewrite_preserves_other_layers(studio):
    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda route: route.fulfill(json={"ai": True, "budget": 5, "reserved": 0, "spent": 0}))
    requests = []
    def assist(route):
        requests.append(route.request.post_data_json)
        route.fulfill(json={"source":"stepfun","reason":"精简主视觉用词","fields":{"description":"Aglow"}})
    page.route("**/api/assist", assist)
    page.goto(url+"?mode=templates#new?edition=afterglow&format=landscape")
    display = page.locator('.cs-art [data-layer="display"]')
    display.click()
    page.get_by_role("button",name="AI 润色这段文字").click()
    expect(page.get_by_role("dialog")).to_contain_text("Afterglow")
    expect(display).to_have_text("Afterglow")
    page.get_by_role("button",name="暂不修改").click()
    expect(display).to_have_text("Afterglow")
    page.get_by_role("button",name="AI 润色这段文字").click()
    page.get_by_role("button",name="应用到整套物料").click()
    expect(display).to_have_text("Aglow")
    expect(page.locator('.cs-art [data-layer="title"]')).to_have_text("深海回响")
    page.get_by_role("button",name="撤销",exact=True).click()
    expect(display).to_have_text("Afterglow")
    assert requests[0]["brief"]["description"] == "Afterglow"
