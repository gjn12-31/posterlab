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
    page.get_by_role("link", name="设计样张", exact=True).tap()
    page.get_by_role("button", name="16:9",exact=True).tap()
    page.get_by_role("link", name="编辑深海微光",exact=True).tap()
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
    page.get_by_role("link", name="设计样张", exact=True).click()
    page.get_by_role("button", name="试排我的标题").click()
    page.get_by_label("海报标题").fill("植物开放日")
    assert page.locator(".at-proof").get_by_text("植物开放日").count() == 7
    page.get_by_role("link", name="编辑植物图鉴").click()
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
    page.get_by_role("button",name="应用到整套宣传材料").click()
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
    page.get_by_role("button",name="应用到整套宣传材料").click()
    expect(display).to_have_text("Aglow")
    expect(page.locator('.cs-art [data-layer="title"]')).to_have_text("深海回响")
    page.get_by_role("button",name="撤销",exact=True).click()
    expect(display).to_have_text("Afterglow")
    assert requests[0]["brief"]["description"] == "Afterglow"


def test_curated_detail_saved_crop_and_offline_folio(studio):
    browser, url = studio
    page = browser.new_page(viewport={"width": 390, "height": 844}, has_touch=True)
    page.goto(url)
    page.get_by_role("link", name="浏览灵感档案").tap()
    page.get_by_role("button", name="放大观察富士山").tap()
    lightbox = page.get_by_role("dialog")
    expect(lightbox.locator("output")).to_have_text("300%")
    lightbox.get_by_role("button", name="收藏当前局部").tap()
    lightbox.get_by_role("button", name="关闭高清看图").tap()
    page.get_by_role("link",name="我的收藏",exact=False).tap()
    crop = page.get_by_alt_text("收藏的神奈川冲浪里局部")
    expect(crop).to_be_visible()
    page.get_by_label("神奈川冲浪里的笔记").fill("远山的轮廓与浪尖呼应。")
    page.reload()
    expect(page.get_by_label("神奈川冲浪里的笔记")).to_have_value("远山的轮廓与浪尖呼应。")
    with page.expect_download() as dl:
        page.get_by_role("button",name="导出图集").tap()
    html = Path(dl.value.path()).read_text()
    assert html.count("data:image/") == 2 and "远山的轮廓" in html and "metmuseum.org" in html
    page.get_by_role("link",name="作品索引",exact=True).tap()
    page.get_by_label("搜索作品").fill("葛饰北斋")
    expect(page.locator(".at-card")).to_have_count(2)
    page.get_by_role("link",name="查看神奈川冲浪里").tap()
    expect(page.get_by_role("heading",name="神奈川冲浪里")).to_be_visible()
    expect(page.get_by_text("大都会艺术博物馆",exact=True).last).to_be_visible()
    page.get_by_role("button",name="返回浏览").tap()
    expect(page.locator(".at-card")).to_have_count(2)


def test_comparison_linked_and_independent_zoom(studio):
    browser, url = studio
    page = browser.new_page()
    page.goto(url+"#compare/great-wave/red-fuji")
    areas=page.locator(".at-pair section")
    areas.first.get_by_role("button",name="放大",exact=True).click()
    expect(areas.first.locator("output")).to_have_text("150%")
    expect(areas.last.locator("output")).to_have_text("150%")
    page.get_by_role("button",name="联动已开启").click()
    areas.last.get_by_role("button",name="放大",exact=True).click()
    expect(areas.first.locator("output")).to_have_text("150%")
    expect(areas.last.locator("output")).to_have_text("200%")
    page.get_by_label("右侧作品",exact=True).select_option("blue-fern")
    expect(areas.last.get_by_role("heading")).to_have_text("蓝晒蕨叶")


def test_campaign_reschedule_export_and_continue_editing(studio):
    browser, url = studio
    context = browser.new_context(permissions=["clipboard-read", "clipboard-write"])
    page = context.new_page()
    page.goto(url)
    page.get_by_role("link", name="制作活动海报").click()
    page.get_by_label("活动通知").fill(
        "山野植物观察日\n2026年12月5日 09:30，地点：望山公园。\n带上速写本，观察冬日植物。"
    )
    page.get_by_role("button", name="生成并预览").click()
    dialog = page.get_by_role("dialog")
    for label in ["竖版海报", "社交方图", "横版封面"]:
        dialog.get_by_role("button", name=label, exact=True).click()
        expect(dialog.locator('[data-layer="title"]')).to_have_text("山野植物观察日")
    dialog.get_by_role("button", name="关闭").click()
    page.get_by_role("button", name="改时间地点").click()
    dialog.get_by_label("活动日期").fill("2026-12-06")
    dialog.get_by_label("活动时间").fill("10:15")
    dialog.get_by_label("活动地点").fill("南山植物园")
    dialog.get_by_role("button", name="保存并同步").click()
    for venue in page.locator('.cp-sheet [data-layer="venue"]').all():
        expect(venue).to_have_text("南山植物园")
    page.get_by_role("button", name="复制文案").click()
    assert "望山公园 → 南山植物园" in page.evaluate("navigator.clipboard.readText()")
    page.get_by_role("button", name="添加报名二维码").click()
    dialog.get_by_label("报名链接").fill("https://example.org/walk")
    dialog.get_by_role("button", name="保存并同步").click()
    expect(page.locator(".cp-sheet svg svg path")).to_have_count(3)
    page.get_by_role("button", name="改期通知", exact=True).click()
    assert "2026-12-05 09:30 → 2026-12-06 10:15" in page.get_by_label("发布文案").input_value()
    with page.expect_download() as dl:
        page.get_by_role("button", name="下载整套 ZIP", exact=True).click()
    with ZipFile(dl.value.path()) as archive:
        snap = json.loads(archive.read("project.posterlab.json"))["current"]
        assert snap["brief"]["venue"] == "南山植物园" and snap["layout"] == "campaign"
        assert "https://example.org/walk" in archive.read("发布文案.txt").decode()
        assert "望山公园 → 南山植物园" in archive.read("改期通知.txt").decode()
        sizes = []
        for name in archive.namelist():
            if name.endswith(".png"):
                with Image.open(archive.open(name)) as image:
                    sizes.append(image.size)
                    assert len(image.convert("RGB").resize((80, 80)).getcolors(6400)) > 200
        assert sorted(sizes) == [(1080, 1080), (1080, 1440), (1920, 1080)]
    page.reload()
    expect(page.get_by_role("heading", name="山野植物观察日")).to_be_visible()
    page.get_by_role("button", name="编辑画布").nth(1).click()
    art = page.locator(".cs-art")
    expect(art.locator('[data-layer="venue"]')).to_have_text("南山植物园")
    page.wait_for_function("location.hash==='#studio/square'")
    art.locator('[data-layer="title"]').click()
    page.get_by_label("修改图层文字").fill("山野写生会")
    expect(art.locator('[data-layer="title"]')).to_have_text("山野写生会")
    expect(page.locator(".cs-status")).to_contain_text("已自动保存")
    page.get_by_title("返回宣传制作台").click()
    expect(page.get_by_role("heading", name="山野写生会")).to_be_visible()
    page.get_by_role("button", name="改时间地点").click()
    dialog.get_by_label("活动时间").fill("14:00")
    dialog.get_by_role("button", name="保存并同步").click()
    page.get_by_role("button", name="编辑画布").last.click()
    expect(art.locator('[data-layer="time"]')).to_have_text("14:00")
    expect(art.locator('[data-layer="title"]')).to_have_text("山野写生会")
    context.close()


def test_paper_pdf_figure_platforms_and_download(studio, tmp_path):
    browser, url = studio
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.set_content("""<title>Urban shade observations</title><h1>Urban shade observations</h1>
        <h2>Abstract</h2><p>We compared shaded and exposed paths across four parks.
        The observed pattern was limited to summer afternoons.</p><h2>Introduction</h2>
        <div style="page-break-before:always;background:#007b71;width:360px;height:240px">Figure 1</div>""")
    path = tmp_path / "study.pdf"
    page.pdf(path=path, print_background=True)
    page.goto(url)
    page.get_by_role("link", name="论文传播").click()
    page.get_by_role("button", name="导入论文 PDF").click()
    page.get_by_label("选择论文文件").set_input_files(path)
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label("论文标题")).to_have_value("Urban shade observations")
    assert "Introduction" not in dialog.get_by_label("摘要或论文原文").input_value()
    dialog.get_by_role("button", name="生成四套宣传材料").click()
    expect(page.locator(".pr-generic")).to_be_visible()
    page.get_by_role("button",name="选取论文插图").click()
    dialog.get_by_label("论文页码").select_option("2")
    expect(dialog.get_by_label("图片署名或来源")).to_have_value("study · 第 2 页")
    crop = dialog.locator(".pr-crop")
    bounds=crop.bounding_box()
    page.mouse.move(bounds["x"]+bounds["width"]*.08,bounds["y"]+bounds["height"]*.08)
    page.mouse.down()
    page.mouse.move(bounds["x"]+bounds["width"]*.50,bounds["y"]+bounds["height"]*.23,steps=5)
    page.mouse.up()
    dialog.get_by_role("button",name="将选区用于四张配图").click()
    expect(page.locator(".pr-userfig")).to_be_visible()
    page.get_by_role("button",name="编辑",exact=True).click()
    dialog.get_by_label("发布文案").fill("夏日树荫观察笔记")
    dialog.get_by_role("button",name="保存文案").click()
    page.reload()
    expect(page.locator(".pr-copy")).to_have_text("夏日树荫观察笔记")
    assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
    with page.expect_download() as dl:
        page.get_by_role("button",name="下载整套 ZIP").click()
    with ZipFile(dl.value.path()) as z:
        assert z.read("小红书/发布文案.txt").decode()=="夏日树荫观察笔记"
        assert "study · 第 2 页" in z.read("原文与引文.txt").decode()
        assert "EHT" not in z.read("原文与引文.txt").decode()
        assert "夏日树荫观察笔记" not in z.read("朋友圈/发布文案.txt").decode()
        for channel, size in [("小红书",(1080,1440)),("X",(1600,900)),("朋友圈",(1080,1080)),("公众号",(1800,766))]:
            with Image.open(z.open(channel+"/配图.png")) as art:
                assert art.size==size
                colors = [rgb for _, rgb in art.convert("RGB").resize((100,100)).getcolors(10000)]
                assert any(g>80 and g-r>60 and b-r>60 for r,g,b in colors)
    page.get_by_role("button", name="我的论文").click()
    dialog.get_by_role("button", name="黑洞的阴影，是怎样拍到的？").click()
    expect(page.locator(".pr-space")).to_be_visible()
    page.get_by_role("button", name="我的论文").click()
    dialog.get_by_role("button", name="Urban shade observations").click()
    expect(page.locator(".pr-copy")).to_have_text("夏日树荫观察笔记")
    page.close()


def test_home_previews_show_files_from_downloaded_kits(studio):
    browser, url = studio
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.goto(url)
    for title, channel, filename in [
        ("M87 中心的亮环有多大？", "公众号", "公众号/发布文案.txt"),
        ("街区咖啡日", "横版封面", "发布文案.txt"),
    ]:
        page.get_by_role("button", name="预览" + title).click()
        dialog = page.get_by_role("dialog", name=title)
        dialog.get_by_role("button", name=channel).click()
        expect(dialog.get_by_role("img", name=channel + "配图")).to_be_visible()
        copy = dialog.locator(".ds-kit-body p").inner_text()
        page.keyboard.press("Escape")
        expect(dialog).to_have_count(0)
        with page.expect_download() as download:
            page.get_by_role("link", name="下载" + title + "示例 ZIP").click()
        with ZipFile(download.value.path()) as z:
            assert z.read(filename).decode() == copy
    page.close()


def test_paper_sends_reviewed_first_two_pages_and_keeps_partial_reply(studio, tmp_path):
    browser, url = studio
    page = browser.new_page()
    page.set_content("""<title>City shades</title><h1>City shades</h1><h2>Abstract</h2>
        <p>Four parks were studied in summer.</p><h2>1. Introduction</h2>
        <p>Earlier studies focused on winter.</p><section style="break-before:page">A second page of background.</section>
        <section style="break-before:page">Never send the third page.</section>""")
    path = tmp_path / "shade.pdf"
    page.pdf(path=path)
    page.route("**/api/status", lambda r: r.fulfill(json={"ai": True}))
    requests = []

    def capture(route):
        requests.append(route.request.post_data_json)
        route.fulfill(json={"model":"test-model", "provider":"StepFun", "headline":"城市树荫",
                            "red":"模型返回的笔记", "moments":"模型返回的短分享", "evidence_ids":{}})

    page.route("**/api/outreach/paper", capture)
    page.goto(url + "#papers/import")
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("选择论文文件").set_input_files(path)
    intro = dialog.get_by_role("textbox", name="引言")
    expect(intro).to_have_value("Earlier studies focused on winter.\nA second page of background.")
    intro.fill("Earlier work examined winter shade.")
    assert not requests
    dialog.get_by_role("button", name="生成四套宣传材料").click()
    expect(dialog).to_have_count(0)
    assert len(requests) == 1
    assert requests[0]["sections"] == {"abstract":"Four parks were studied in summer.", "introduction":"Earlier work examined winter shade."}
    expect(page.locator(".pr-copy")).to_contain_text("模型返回的笔记")
    page.locator(".pr-tabs").get_by_role("button", name="公众号").click()
    expect(page.get_by_role("heading", name="本地摘录",exact=False)).to_be_visible()
    page.close()


def test_paper_service_failure_saves_sources_then_retries_without_another_upload(studio):
    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda r: r.fulfill(json={"ai": True}))
    calls = []
    def assist(route):
        calls.append(route.request.post_data_json)
        if len(calls) == 1:
            route.fulfill(status=502, json={"detail":"模型回复不完整"})
        else:
            route.fulfill(json={"model":"test-model", "provider":"StepFun","headline":"公园观察",
                                "red":"模型笔记","moments":"公园观察分享","x":["Summer shade."],
                                "wechat":"公众号导读", "evidence_ids":{}})
    page.route("**/api/outreach/paper", assist)
    page.goto(url+"#papers/import")
    d=page.get_by_role("dialog")
    d.get_by_label("论文标题").fill("Park shade")
    d.get_by_label("摘要或论文原文").fill("The team observed four parks across the city.")
    d.get_by_role("button",name="生成四套宣传材料").click()
    expect(page.get_by_text("StepFun 未返回可用文案，已保存本地摘录稿")).to_be_visible()
    page.reload()
    page.get_by_role("button",name="编辑",exact=True).click()
    d.get_by_label("发布文案").fill("我已核过这段文字")
    d.get_by_role("button",name="保存文案").click()
    page.get_by_role("button",name="用原摘要和引言重新撰写").click()
    expect(page.locator(".pr-recovery")).to_have_count(0)
    expect(page.locator(".pr-copy")).to_contain_text("我已核过这段文字")
    page.locator(".pr-tabs").get_by_role("button",name="公众号").click()
    expect(page.locator(".pr-copy")).to_contain_text("公众号导读")
    assert len(calls)==2 and calls[0]==calls[1]
