"""Exercise the finished poster, direct manipulation, and export in a browser."""
import json
import re
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


def test_activity_drawio_keeps_editable_fields_images_qr_and_dragged_position(studio):
    import base64
    import html
    from io import BytesIO
    import xml.etree.ElementTree as ET

    browser, url = studio
    page = browser.new_page(viewport={"width":1440,"height":960})
    page.route("**/api/status", lambda route: route.fulfill(json={"ai":False}))
    page.goto(url + "#campaign")
    page.locator("#cp-notice").fill("蓝晒 & 印刷\n日期：2026-12-12\n地点：海边印刷室\n报名链接：https://example.org/print")
    page.get_by_role("button", name="生成并预览").click()
    dialog = page.get_by_role("dialog")

    def layers(file, width, height):
        doc = ET.parse(file)
        model = doc.find(".//mxGraphModel")
        assert (model.get("pageWidth"),model.get("pageHeight"))==(str(width),str(height))
        return {node.get("name"):node for node in model.findall(".//UserObject")}

    def bitmap(layer):
        style = layer.find("mxCell").get("style")
        data = re.search(r"image=data:image/(?:png|jpeg|webp),([A-Za-z0-9+/=]+);",style)
        assert data
        return Image.open(BytesIO(base64.b64decode(data[1])))

    def value(node):
        return html.unescape(re.sub(r"<[^>]+>", "", node.get("label")))

    for f,width,height in (("社交方图",1080,1080),("横版封面",1920,1080),("竖版海报",1080,1440)):
        dialog.get_by_role("button",name=f,exact=True).click()
        with page.expect_download() as download:
            dialog.get_by_role("button",name="下载 .drawio",exact=True).click()
        assert download.value.suggested_filename.endswith(f + ".drawio")
        cells = layers(download.value.path(),width,height)
        assert value(cells["活动标题"]).replace(" ","")=="蓝晒&印刷"
        assert value(cells["活动日期"])=="2026-12-12" and value(cells["活动地点"])=="海边印刷室"
        assert "shape=rectangle" in cells["分隔线"].find("mxCell").get("style")
        photo = bitmap(cells["主视觉"])
        assert photo.width>300 and photo.height>250
        if f=="社交方图":
            assert photo.mode=="RGBA" and photo.getpixel((0,0))[3]==0
            assert photo.getpixel((photo.width//2,photo.height//2))[3] == 255
        qr = bitmap(cells["报名二维码"]).convert("L")
        assert qr.getextrema() == (0,255) and qr.width == qr.height

    dialog.get_by_role("button",name="拖动编辑").click()
    title = page.locator('.cs-art [data-layer="title"]')
    original = title.get_attribute("transform")
    area = title.bounding_box()
    x,y=area["x"]+area["width"]/2,area["y"]+area["height"]/2
    page.mouse.move(x,y)
    page.mouse.down()
    page.mouse.move(x+50,y+60,steps=8)
    page.mouse.up()
    moved=title.get_attribute("transform")
    assert moved != original
    title.click()
    page.get_by_role("button", name="添加自由文字").click()
    page.get_by_label("修改图层文字").fill("现场自由创作")
    page.get_by_role("button",name="更多导出格式").click()
    page.get_by_role("button",name="可编辑 .drawio").click()
    with page.expect_download() as download:
        page.get_by_role("button",name="下载作品").click()
    edited=layers(download.value.path(),1080,1440)
    assert value(edited["自由文字"]) == "现场自由创作"
    geometry=edited["活动标题"].find("mxCell/mxGeometry")
    expected = [float(n) for n in re.findall(r"[\d.]+",moved)]
    assert [float(geometry.get(v)) for v in ("x","y")] == pytest.approx(expected,abs=.002)
    page.close()


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
    page.get_by_role("link", name="灵感档案").tap()
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
    views = page.get_by_role("group", name="选择预览画幅")
    views.get_by_role("button", name="社交方图").click()
    expect(page.locator(".cp-spread .cp-sheet")).to_have_count(1)
    expect(page.locator(".cp-spread .cp-square")).to_be_visible()
    views.get_by_role("button", name="全套").click()
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
        calendar = archive.read("发布计划/发布日历.ics").decode()
        assert calendar.count("BEGIN:VEVENT") == 3
        assert all("DTSTART;VALUE=DATE:" + day in calendar for day in ["20261129", "20261205", "20261206"])
        assert "带上速写本" in archive.read("发布计划/2-行前提醒.txt").decode()
        sizes = []
        for name in archive.namelist():
            if name.endswith(".png"):
                with Image.open(archive.open(name)) as image:
                    sizes.append(image.size)
                    assert len(image.convert("RGB").resize((80, 80)).getcolors(6400)) > 200
        assert sorted(sizes) == [(1080, 1080), (1080, 1440), (1920, 1080)]
    page.get_by_role("link", name="打开活动发布计划").click()
    stages = page.get_by_role("group", name="发布阶段")
    stages.get_by_role("button", name="行前提醒", exact=False).click()
    page.get_by_role("button", name="编辑此阶段").click()
    page.get_by_label("开场文案").fill("请把南山植物园的位置存进地图。")
    page.get_by_label("配图", exact=True).select_option("landscape")
    page.get_by_role("button", name="保存此阶段").click()
    expect(page.get_by_label("发布文案")).to_have_value(re.compile("存进地图"))
    page.reload()
    stages.get_by_role("button", name="行前提醒", exact=False).click()
    expect(page.get_by_label("发布文案")).to_have_value(re.compile("存进地图"))
    page.get_by_role("button", name="复制文案").click()
    assert page.evaluate("navigator.clipboard.readText()") == page.get_by_label("发布文案").input_value()
    page.get_by_role("link", name="活动制作台", exact=True).click()
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
    page.get_by_role("link", name="导入论文 PDF").click()
    page.get_by_label("选择论文文件").set_input_files(path)
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_label("摘要或论文原文")).to_be_hidden()
    dialog.get_by_role("button",name="查看或修改提取内容").click()
    expect(dialog.get_by_label("论文标题")).to_have_value("Urban shade observations")
    assert "Introduction" not in dialog.get_by_label("摘要或论文原文").input_value()
    dialog.get_by_role("button", name="生成四套本地摘录稿").click()
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
    dialog.get_by_role("button", name="M87 中心的亮环有多大？").click()
    expect(page.locator(".pr-space")).to_be_visible()
    page.get_by_role("button", name="我的论文").click()
    dialog.get_by_role("button", name="Urban shade observations").click()
    expect(page.locator(".pr-copy")).to_have_text("夏日树荫观察笔记")
    page.close()


@pytest.mark.parametrize("graphic", ["vector", "raster", "reference_only"])
def test_import_crops_captioned_figure_beyond_text_pages(studio, tmp_path, graphic):
    import base64
    from io import BytesIO

    browser, url = studio
    page = browser.new_page()
    has_figure = graphic != "reference_only"
    caption = "Figure 1: Paired measurements." if has_figure else "Figure 1 shows paired measurements."
    panels = """<svg width="260" height="110" viewBox="0 0 260 110">
        <rect width="100" height="100" fill="#008a7a"/>
        <rect x="145" width="100" height="100" fill="#b14128"/>
      </svg>"""
    if graphic == "raster":
        image = Image.new("RGB", (260, 110), "white")
        image.paste("#008a7a", (0, 0, 100, 100))
        image.paste("#b14128", (145, 0, 245, 100))
        raster = BytesIO()
        image.save(raster, format="PNG")
        panels = '<img width="260" height="110" src="data:image/png;base64,' + base64.b64encode(raster.getvalue()).decode() + '">'
    page.set_content(f"""<title>Parallel observations</title>
      <h1>Parallel observations</h1><h2>Abstract</h2><p>We compared two sets of observations
      over four summer days in the same urban park.</p><h2>Introduction</h2>
      <p>Repeated walks reveal variation across the same four paths.</p>
      <section style="break-before:page">Field methods and observation schedule.</section>
      <section style="break-before:page;display:flex">
      <div style="width:52%">{panels}<p>{caption}</p></div>
      <div><div style="width:220px;height:110px;background:#1200f0"></div>
      <p>Figure 2: Measurements from a different location.</p></div></section>""")
    path = tmp_path / "parallel.pdf"
    page.pdf(path=path, print_background=True)
    page.route("**/api/status", lambda route: route.fulfill(json={"ai": False}))
    page.goto(url + "#papers/import")
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("选择论文文件").set_input_files(path)
    expect(dialog).to_contain_text("已读取 3 页，摘要与引言取自前 2 页")
    dialog.locator("button.pr-action").click()
    expect(dialog).not_to_be_visible()
    source = saved_research_paper(page, "Parallel observations")
    assert [p["page"] for p in source["sourcePages"]] == [1, 2, 3]
    assert "different location" in source["sourcePages"][2]["text"]
    assert "different location" not in source["sections"]["introduction"]
    candidates = {v["label"]:v for v in source["visuals"]}
    assert "Figure 2" in candidates
    assert ("Figure 1" in candidates) == has_figure
    assert all(v["page"] == 3 and v["kind"] == "figure" for v in candidates.values())
    assert set(source["posterLayouts"]) == {"red", "x", "moments", "wechat"}
    right_panel = candidates["Figure 2"]["data"].split(",")[1]
    with Image.open(BytesIO(base64.b64decode(right_panel))) as image:
        assert 1.85 < image.width / image.height < 2.15
        rgb = image.convert("RGB")
        for x in (0.10, 0.50, 0.90):
            pixel = rgb.getpixel((round(image.width * x), image.height // 2))
            assert max(abs(a - b) for a, b in zip(pixel, (18, 0, 240))) < 12
    if not has_figure:
        assert "figure" not in source
    else:
        figure = source["figure"]
        assert figure["credit"] == "Figure 1 · 原论文第 3 页"
        assert figure["data"] == candidates["Figure 1"]["data"]
        assert "Paired measurements" in candidates["Figure 1"]["caption"]
        with Image.open(BytesIO(base64.b64decode(figure["data"].split(",")[1]))) as img:
            ratio = img.width / img.height
            assert 2.1 < ratio < 2.6
            assert img.width > 900
            for x, color in [(0.20, (0, 138, 122)), (0.80, (177, 65, 40))]:
                actual = img.convert("RGB").getpixel((int(img.width * x), img.height // 2))
                assert max(abs(a - b) for a, b in zip(actual, color)) < 12
    page.close()


def saved_research_paper(page, title):
    # The journal contains either a whole draft or an IndexedDB pointer.
    snapshot = page.wait_for_function("""title => {
        const draft = JSON.parse(localStorage.getItem('posterlab.paper.v1') || 'null');
        return draft?.libraryId || (draft?.title === title && draft.process?.stages.compile?.state === 'done')
          ? draft : false;
    }""", arg=title).json_value()
    if 'libraryId' in snapshot:
        snapshot = page.evaluate("""async id => {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('posterlab-paper-library');
                req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
            });
            try {
                return await new Promise((resolve, reject) => {
                    const req = db.transaction('papers').objectStore('papers').get(id);
                    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
                });
            } finally { db.close(); }
        }""", snapshot['libraryId'])
    assert snapshot['title'] == title and snapshot['process']['stages']['compile']['state'] == 'done'
    return snapshot


def research_reading_fixture(body):
    quote = body["sections"]["abstract"]
    return {"provider":"fixture", "model":"reader", "methodFigureId": None, "resultTableId": None,
            "reading":{"problem":{"text":"观察城市树荫。","refs":[{"page":1,"quote":quote}]},
                       "method":{"text":"","refs":[]},"result":{"text":"","refs":[]}}}


def research_layout_fixture():
    return {"provider":"fixture","model":"layout",
            "layout":{"title":"城市树荫","subtitle":"","composition":"balanced","accent":"teal",
                      "blocks":[{"role":"problem","heading":"研究问题","text":"观察城市树荫。"}],"caption":""}}


def open_saved_m87_draft(page, url):
    # Old browser drafts predate multi-figure projects. Exercise migration with
    # that actual format independently of whichever case is featured today.
    quote = "The ring diameter is 42 ± 3 microarcseconds."
    copy = json.loads((SITE.parent / "web/src/paper-example-copy.json").read_text())
    legacy = {"id":"example-m87","title":"First M87 Event Horizon Telescope Results",
              "headline":"M87 中心的亮环有多大？","source":"https://doi.org/10.3847/2041-8213/ab0ec7",
              "body":quote,"sample":True,"evidence":[{"quote":quote,"line":"亮环直径约 42 微角秒。"}],
              "edits":copy}
    page.goto(url)
    page.evaluate("(p)=>localStorage.setItem('posterlab.paper.v1',JSON.stringify(p))",legacy)
    page.goto(url+"#papers")


def test_paper_channels_preserve_existing_work_and_export_platform_files(studio):
    browser, url = studio
    ctx = browser.new_context(permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.route("**/api/status", lambda route: route.fulfill(json={"ai": False}))
    open_saved_m87_draft(page, url)
    expect(page.locator(".pub-copy")).to_contain_text("M87 中心的亮环")
    # A previously saved paper with custom copy and archived card data.
    page.evaluate(r"""() => {
        const key = 'posterlab.paper.v1';
        const p = JSON.parse(localStorage.getItem(key));
        p.edits.red = '我的发布标题\n\n我编辑过的正文';
        p.story = [{id:'cover',role:'封面',title:'旧封面',body:'',quote:''},
                   {id:'note',role:'发现',title:'旧标题',body:'我的笔记',quote:p.evidence[0].quote}];
        localStorage.setItem(key,JSON.stringify(p));
    }""")
    page.goto(url)
    page.goto(url + "#papers/story")
    expect(page).to_have_url(re.compile(r"#papers/channels$"))
    expect(page.locator(".pub-copy")).to_contain_text("我编辑过的正文")
    expect(page.get_by_role("dialog")).to_have_count(0)
    page.get_by_role("button", name="复制标题").click()
    assert page.evaluate("navigator.clipboard.readText()") == "我的发布标题"
    with page.expect_download() as dl:
        page.get_by_role("button", name="下载本平台").click()
    with ZipFile(dl.value.path()) as z:
        assert z.read("小红书/标题.txt").decode() == "我的发布标题"
        assert z.read("小红书/正文.txt").decode() == "我编辑过的正文"
        assert [n for n in z.namelist() if n.endswith(".png")] == ["小红书/配图.png"]
    page.locator(".pub-channels").get_by_role("button", name="X", exact=True).click()
    page.get_by_role("button", name="复制第 1 帖").click()
    first = page.evaluate("navigator.clipboard.readText()")
    with page.expect_download() as dl:
        page.get_by_role("button", name="下载本平台").click()
    with ZipFile(dl.value.path()) as z:
        assert z.read("X/短帖/01.txt").decode() == first
    page.locator(".pub-channels").get_by_role("button", name="公众号").click()
    page.get_by_role("button", name="编辑", exact=True).click()
    article = "研究导读\n\n文字 <img src=x onerror=alert(1)> 与引文"
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("发布文案").fill(article)
    dialog.get_by_role("button",name="保存文案").click()
    page.get_by_role("button", name="复制排版").click()
    expect(page.get_by_role("status").filter(has_text="已复制标题和段落排版")).to_be_visible()
    assert page.evaluate("navigator.clipboard.readText()") == article
    rich = page.evaluate("async () => (await (await navigator.clipboard.read())[0].getType('text/html')).text()")
    assert "研究导读" in rich and "&lt;img" in rich and "<img" not in rich
    with page.expect_download() as dl:
        page.get_by_role("button", name="下载整套 ZIP").click()
    with ZipFile(dl.value.path()) as z:
        assert len([n for n in z.namelist() if n.endswith(".png")]) == 4
        assert z.read("公众号/发布文案.txt").decode() == article
        assert "&lt;img" in z.read("公众号/排版稿.html").decode()
        assert not any("图解" in n for n in z.namelist())
    page.reload()
    expect(page.locator(".pub-copy")).to_contain_text("文字 <img")
    assert page.evaluate("JSON.parse(localStorage.getItem('posterlab.paper.v1')).story[1].body") == "我的笔记"
    ctx.close()


def test_paper_resumes_latest_library_copy_when_local_storage_is_full(studio):
    browser, url = studio
    page = browser.new_page()
    open_saved_m87_draft(page, url)
    expect(page.locator(".pub-copy")).to_contain_text("M87")
    page.wait_for_function("!!localStorage.getItem('posterlab.paper.v1')")
    page.evaluate("""() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'posterlab.paper.v1' && value.includes('恢复后的新文案'))
          throw new DOMException('full', 'QuotaExceededError');
        return set.call(this, key, value);
      };
    }""")
    page.get_by_role("button", name="编辑", exact=True).click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("发布文案").fill("恢复后的新文案")
    dialog.get_by_role("button", name="保存文案").click()
    page.wait_for_function("!!JSON.parse(localStorage.getItem('posterlab.paper.v1')).libraryId")
    page.reload()
    expect(page.locator(".pub-copy")).to_contain_text("恢复后的新文案")
    page.get_by_role("button", name="我的论文").click()
    page.get_by_role("dialog").get_by_role("button", name="M87 中心的亮环有多大？").click()
    expect(page.locator(".pub-copy")).to_contain_text("恢复后的新文案")
    page.close()


def test_large_paper_keeps_last_edit_and_figure_across_immediate_reload(studio):
    import base64
    from io import BytesIO

    browser, url = studio
    page = browser.new_page()
    open_saved_m87_draft(page, url)
    # Ensure the original small draft was saved through the application's library.
    page.get_by_role("button", name="我的论文").click()
    library = page.get_by_role("dialog")
    library.get_by_role("button", name="M87 中心的亮环有多大？").click()
    expect(library).to_be_hidden()
    jpeg = BytesIO()
    Image.effect_noise((1300, 1300), 92).convert("RGB").save(jpeg, format="JPEG", quality=90)
    data = "data:image/jpeg;base64," + base64.b64encode(jpeg.getvalue()).decode()
    assert 1_000_000 < len(data) < 2_400_000
    # Seed the existing local draft format, then let the application migrate it.
    # A raw indexedDB.open() in the fixture can create a v1 database with no
    # stores before the app runs its upgrade callback, particularly in cold CI.
    page.goto(url)
    page.evaluate("""data => {
      const key = 'posterlab.paper.v1';
      const source = JSON.parse(localStorage.getItem(key));
      source.id = 'oversize-figure'; source.headline = '大稿恢复测试';
      source.figure = {data, credit:'原图'};
      localStorage.setItem(key, JSON.stringify(source));
    }""", data)
    page.goto(url + "#papers")
    page.wait_for_function("JSON.parse(localStorage.getItem('posterlab.paper.v1')).libraryId === 'oversize-figure'")
    page.reload()
    expect(page.locator(".pr-userfig")).to_be_visible()
    page.get_by_role("button", name="编辑", exact=True).click()
    page.get_by_role("textbox", name="发布文案", exact=True).fill("大图稿的最后一次编辑")
    page.get_by_role("button", name="保存文案").click()
    page.reload()
    expect(page.locator(".pub-copy")).to_contain_text("大图稿的最后一次编辑")
    page.get_by_role("button", name="我的论文").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("button", name="M87 中心的亮环有多大？").click()
    page.get_by_role("button", name="我的论文").click()
    dialog.get_by_role("button", name="大稿恢复测试").click()
    expect(page.locator(".pub-copy")).to_contain_text("大图稿的最后一次编辑")
    assert page.locator(".pr-userfig").get_attribute("src") == data
    page.close()


def test_home_previews_show_files_from_downloaded_kits(studio):
    browser, url = studio
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.goto(url)
    intro = page.locator("section#desk")
    expect(intro.get_by_role("heading", level=1)).to_contain_text("多平台发布")
    expect(intro).to_contain_text("论文")
    expect(intro).to_contain_text("活动")
    expect(intro.get_by_role("link",name="导入论文 PDF")).to_have_count(0)
    wall = intro.get_by_role("group", name="宣传作品海报墙")
    wall.get_by_role("button", name="暂停海报浮动").click()
    expect(wall.locator(".wall-mount img").first).to_have_css("animation-play-state", "paused")
    wall.get_by_role("button", name="欣赏海报：ClashBench · 共享资源冲突评测").click()
    lightbox = page.get_by_role("dialog")
    page.keyboard.press("ArrowRight")
    expect(lightbox.get_by_role("heading", name="秋夜设计书展")).to_be_visible()
    lightbox.get_by_role("link", name="查看宣传套装").click()
    expect(page).to_have_url(re.compile(r"#collection/bookfair$"))
    expect(page.locator("#collection").get_by_role("button",name="秋夜设计书展",exact=True)).to_have_attribute("aria-pressed","true")
    page.goto(url)
    expect(intro.get_by_role("heading", level=1)).to_be_in_viewport()
    paper = page.get_by_role("link", name="导入论文 PDF")
    expect(paper).not_to_be_in_viewport()
    intro.get_by_role("link", name="看生成演示").click()
    demo = page.locator("#demo")
    slider = demo.get_by_role("slider", name="对照原稿和发布成品")
    expect(slider).to_be_in_viewport()
    demo.get_by_role("button", name="活动案例").click()
    slider.focus()
    page.keyboard.press("Home")
    expect(slider).to_have_value("0")
    expect(demo.get_by_role("img", name="秋夜设计书展宣传海报")).to_be_visible()
    page.keyboard.press("End")
    expect(slider).to_have_value("100")
    page.get_by_role("banner").get_by_role("link", name="进入工作台").click()
    expect(paper).to_be_in_viewport()
    expect(page.get_by_role("link",name="制作活动海报")).to_be_in_viewport()
    page.emulate_media(reduced_motion="reduce")
    expect(intro.locator(".pl-visual")).to_have_css("transform","none")
    page.get_by_role("navigation", name="首页导航").get_by_role("link", name="常见问题").click()
    expect(page.locator("#faq").get_by_role("heading").first).to_be_in_viewport()
    footer = page.get_by_role("contentinfo")
    privacy = footer.get_by_role("button", name="隐私与数据")
    privacy.click()
    expect(page.get_by_role("dialog", name="隐私与数据")).to_be_visible()
    page.keyboard.press("Escape")
    expect(privacy).to_be_focused()
    page.goto(url+"#workbench")
    page.reload()
    expect(page.get_by_role("heading",name="工作台",exact=True)).to_be_in_viewport()
    research = page.get_by_role("button", name="论文宣传", exact=True)
    research.click()
    research.focus()
    for _ in range(5):
        page.keyboard.press("Tab")
    preview = page.get_by_role("region", name="成品交互演示")
    group = preview.get_by_role("group", name="选择案例平台")
    group.get_by_role("button", name="X", exact=True).click()
    expect(preview.get_by_role("img", name="ClashBench 智能体评测 · X成品")).to_be_visible()
    # A pending anchor scroll must keep the selected paper kit under the pointer.
    page.evaluate("scrollTo(0, document.querySelector('.pl-chapter-1').offsetHeight + document.querySelector('#workbench').offsetTop)")
    page.wait_for_function("document.querySelector('.pl-chapter-1').getBoundingClientRect().top < innerHeight * .54")
    expect(group.get_by_role("button", name="X", exact=True)).to_have_attribute("aria-pressed", "true")
    with page.expect_download() as sample:
        preview.get_by_role("link", name="下载示例整套").click()
    with ZipFile(sample.value.path()) as archive:
        assert preview.locator(".pl-output-copy p").inner_text() == archive.read("X/发布文案.txt").decode().strip()
    page.get_by_role("button", name="活动宣传", exact=True).click()
    preview.get_by_role("button", name="横幅", exact=True).click()
    expect(preview.get_by_role("heading", name="横版封面")).to_be_visible()
    with page.expect_download() as banner:
        preview.get_by_role("link", name="下载此画幅").click()
    with page.expect_download() as event:
        preview.get_by_role("link", name="下载示例整套").click()
    with ZipFile(event.value.path()) as archive:
        assert banner.value.path().read_bytes() == archive.read("横版封面.png")
    research.click()
    expect(group.get_by_role("button", name="X", exact=True)).to_have_attribute("aria-pressed", "true")
    for case_name, title, channel, filename in [
        ("LIGO 双黑洞并合", "两台探测器，一段引力波", "小红书", "小红书/发布文案.txt"),
        ("蓝晒工作坊", "晒出一片海 · 蓝晒工作坊", "横版封面", "发布文案.txt"),
        ("秋夜设计书展", "秋夜设计书展", "社交方图", "发布文案.txt"),
        ("PonderLM", "把思考藏进一次预测里", "小红书", "小红书/发布文案.txt"),
        ("M87 黑洞观测","M87 中心的亮环有多大？", "公众号", "公众号/发布文案.txt"),
        ("街区咖啡日","街区咖啡日", "横版封面", "发布文案.txt"),
    ]:
        page.get_by_role("button",name=case_name,exact=True).click()
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
        <section style="break-before:page">Evidence from the third page.</section>""")
    path = tmp_path / "shade.pdf"
    page.pdf(path=path)
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    statuses = []
    page.route("**/api/status", lambda route: statuses.append(route))
    requests, reading_requests, layout_requests = [], [], []
    def reading(route):
        body=route.request.post_data_json
        reading_requests.append(body)
        route.fulfill(json=research_reading_fixture(body))
    def layout(route):
        layout_requests.append(route.request.post_data_json)
        route.fulfill(json=research_layout_fixture())
    page.route("**/api/outreach/paper-reading", reading)
    page.route("**/api/outreach/paper-layout", layout)

    def capture(route):
        requests.append(route.request.post_data_json)
        route.fulfill(json={"model":"test-model", "provider":"StepFun", "headline":"城市树荫",
                            "red":"城市树荫\n\n模型返回的笔记" if len(requests)==1 else "不能覆盖已完成的小红书稿",
                            "moments":"模型返回的短分享", "evidence_ids":{},
                            **({"x":["Compare the shaded paths."],"wechat":"公众号观察\n\n补齐的发布稿。"} if len(requests)>1 else {})})

    page.route("**/api/outreach/paper", capture)
    page.goto(url + "#papers/import")
    dialog = page.get_by_role("dialog")
    dialog.get_by_label("选择论文文件").set_input_files(path)
    expect(dialog.get_by_text("已读取论文",exact=True)).to_be_visible()
    expect(dialog.get_by_label("摘要或论文原文")).to_be_hidden()
    dialog.get_by_role("button",name="查看或修改提取内容").click()
    intro = dialog.get_by_role("textbox", name="引言")
    expect(intro).to_have_value("Earlier studies focused on winter.\nA second page of background.")
    assert intro.get_attribute("maxlength") == "45000"
    intro.fill("Earlier work examined winter shade.")
    assert not requests
    expect(dialog.get_by_role("button", name="正在检查模型服务…")).to_be_disabled()
    assert statuses
    for route in statuses:
        route.fulfill(status=503, json={})
    statuses.clear()
    expect(dialog.get_by_role("button", name="生成四套本地摘录稿")).to_be_enabled()
    with page.expect_request("**/api/status"):
        dialog.get_by_role("button", name="重新连接").click()
    expect(dialog.get_by_role("button", name="正在检查模型服务…")).to_be_disabled()
    assert len(statuses) == 1
    statuses[0].fulfill(json={"ai": True})
    dialog.get_by_role("button", name="生成四套宣传材料").click()
    expect(dialog).to_have_count(0)
    assert len(reading_requests) == len(layout_requests) == len(requests) == 1
    assert [p["page"] for p in reading_requests[0]["pages"]] == [1,2,3]
    assert "Evidence from the third page" in reading_requests[0]["pages"][2]["text"]
    assert reading_requests[0]["candidates"] == []
    assert layout_requests[0]["methodFigureId"] is None and layout_requests[0]["resultTableId"] is None
    assert "pages" not in requests[0]
    assert requests[0]["sections"] == {"abstract":"Four parks were studied in summer.", "introduction":"Earlier work examined winter shade."}
    expect(page.locator(".pr-copy")).to_contain_text("模型返回的笔记")
    page.get_by_role("button", name="复制标题").click()
    assert page.evaluate("navigator.clipboard.readText()") == "城市树荫"
    page.get_by_role("button", name="复制正文").click()
    assert page.evaluate("navigator.clipboard.readText()") == "模型返回的笔记\n\n论文：City shades"
    page.locator(".pr-tabs").get_by_role("button", name="公众号").click()
    expect(page.get_by_text("本地摘录稿", exact=True)).to_be_visible()
    page.get_by_role("button",name="继续未完成的步骤").click()
    expect(page.locator(".pr-copy")).to_contain_text("补齐的发布稿")
    assert len(reading_requests) == len(layout_requests) == 1 and len(requests) == 2
    page.locator(".pr-tabs").get_by_role("button",name="小红书",exact=True).click()
    expect(page.locator(".pr-copy")).to_contain_text("模型返回的笔记")
    page.close()


def test_paper_service_failure_saves_sources_then_retries_without_another_upload(studio):
    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda r: r.fulfill(json={"ai": True}))
    page.route("**/api/outreach/paper-reading", lambda route: route.fulfill(json=research_reading_fixture(route.request.post_data_json)))
    page.route("**/api/outreach/paper-layout", lambda route: route.fulfill(json=research_layout_fixture()))
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
    d.get_by_role("button",name="手动填写标题和摘要").click()
    d.get_by_label("论文标题").fill("Park shade")
    d.get_by_label("摘要或论文原文").fill("The team observed four parks across the city.")
    d.get_by_role("button",name="生成四套宣传材料").click()
    record = page.get_by_role("region", name="海报制作记录")
    expect(record.get_by_role("button", name="继续未完成的步骤")).to_be_visible()
    record.get_by_role("button", name="查看步骤与依据").click()
    expect(record).to_contain_text("模型回复不完整")
    expect(page.get_by_text("本地摘录稿", exact=True)).to_be_visible()
    page.reload()
    page.get_by_role("button",name="编辑",exact=True).click()
    d.get_by_label("发布文案").fill("我已核过这段文字")
    d.get_by_role("button",name="保存文案").click()
    record.get_by_role("button",name="继续未完成的步骤").click()
    expect(record.get_by_role("button",name="继续未完成的步骤")).to_have_count(0)
    expect(page.locator(".pr-copy")).to_contain_text("我已核过这段文字")
    page.locator(".pr-tabs").get_by_role("button",name="公众号").click()
    expect(page.locator(".pr-copy")).to_contain_text("公众号导读")
    page.get_by_role("button", name="核对原句").click()
    d.get_by_text("校对论文出处", exact=True).click()
    d.get_by_label("论文原题").fill("Shade in four city parks")
    d.get_by_label("作者与出版信息").fill("Park Observatory")
    d.get_by_label("原文链接").fill("https://example.org/shade")
    d.get_by_role("button", name="完成核对").click()
    expect(page.locator(".pr-copy")).to_contain_text("Shade in four city parks")
    expect(page.locator(".pr-copy")).to_contain_text("Park Observatory")
    page.locator(".pr-tabs").get_by_role("button", name="小红书").click()
    expect(page.locator(".pr-copy")).to_have_text("我已核过这段文字")
    assert len(calls)==2 and calls[0]==calls[1]
    page.close()


def test_generated_campaign_artwork_applies_to_every_proof_and_survives_failure(studio):
    import base64
    from io import BytesIO

    browser, url = studio
    page = browser.new_page(viewport={"width":1440, "height":960})
    page.route("**/api/status", lambda route: route.fulfill(json={
        "ai": True, "campaign_model": "fixture-text", "artwork_model": "fixture-image",
    }))
    buf = BytesIO()
    Image.new("RGB", (160, 128), "#1683d9").save(buf, "WEBP")
    data_url = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    requests = []

    def artwork(route):
        requests.append(route.request)
        if len(requests) == 1:
            route.fulfill(json={"data_url": data_url, "model": "fixture-image", "provider": "Paratera"})
        else:
            route.fulfill(status=502, json={"detail":"图像服务暂不可用"})

    page.route("**/api/outreach/artwork", artwork)
    page.goto(url + "#campaign")
    page.get_by_role("button", name="生成主视觉", exact=True).click()
    chosen = page.locator('.cp-spread svg image[href^="data:image/"]')
    expect(chosen).to_have_count(3)
    assert requests[0].headers["idempotency-key"] and requests[0].post_data_json["title"]
    page.reload()
    expect(chosen).to_have_count(3)
    page.get_by_role("button", name="生成主视觉", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("图像服务暂不可用")
    expect(chosen).to_have_count(3)
    with page.expect_download() as dl:
        page.get_by_role("button", name="下载整套 ZIP").click()
    with ZipFile(dl.value.path()) as z:
        project = json.loads(z.read("project.posterlab.json"))
        hero = project["current"]["heroId"]
        assert project["assets"][hero]["data"].startswith("data:image/")
    assert len(requests) == 2
    page.close()


@pytest.mark.parametrize("failed_stage", [None, "campaign", "artwork"])
def test_primary_activity_action_creates_and_recovers_each_ai_stage(studio, failed_stage):
    import base64
    from io import BytesIO

    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda r: r.fulfill(json={
        "ai": True, "campaign_model": "writer", "artwork_model": "painter",
    }))
    buf = BytesIO()
    Image.new("RGB", (200, 200), "#274967").save(buf, "WEBP")
    image = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    calls = []
    title = "晒出一片海"
    direction = "蓝晒棉纸中央一支透白海藻，钴蓝与象牙白。"
    retry_existing = False

    def route_call(route):
        stage = route.request.url.rsplit("/", 1)[-1]
        calls.append(stage)
        if stage == failed_stage and calls.count(stage) == 1:
            return route.fulfill(status=502, json={"detail": "服务稍后恢复。"})
        if retry_existing and (stage == "artwork" or failed_stage == "campaign"):
            return route.fulfill(status=502, json={"detail": "服务稍后恢复。"})
        if stage == "campaign":
            assert route.request.post_data_json["brief"]["title"] == title
            return route.fulfill(json={"provider":"Paratera","model":"writer","edition":"course" if retry_existing else "bloom",
                "tag":"CYANOTYPE PRINTS","reason":"活动以植物印刷为主题。","art_direction":direction,
                "invitation":"水洗棉纸，留下你自己的海藻轮廓。"})
        assert route.request.post_data_json["art_direction"] == ("" if failed_stage == "campaign" else direction)
        return route.fulfill(json={"provider":"Paratera","model":"painter","data_url":image})

    page.route("**/api/outreach/*", route_call)
    page.goto(url + "#campaign")
    page.locator("#cp-notice").fill(title + "\n简介：用海藻印一张蓝晒。")
    page.get_by_role("button", name="生成宣传套装").click()
    if failed_stage:
        expect(page.get_by_role("alert")).to_be_visible()
        name = "生成主视觉" if failed_stage == "artwork" else "生成邀请文案"
        page.get_by_role("button", name=name, exact=True).click()
    else:
        page.get_by_role("dialog").get_by_role("button", name="关闭").click()
    expect(page.locator('.cp-spread svg image[href^="data:image/"]')).to_have_count(3)
    expect(page.get_by_label("发布文案", exact=True)).to_have_value(re.compile("留下你自己的海藻轮廓"))
    assert calls == ["campaign", "artwork"] + ([failed_stage] if failed_stage else [])
    page.reload()
    expect(page.locator('.cp-spread svg image[href^="data:image/"]')).to_have_count(3)
    expect(page.get_by_label("发布文案", exact=True)).to_have_value(re.compile("留下你自己的海藻轮廓"))
    # A later failure must retain the paid assets, even if the new concept
    # asks for a different theme before the replacement illustration fails.
    retry_existing = True
    page.locator("#cp-notice").fill(title + "\n简介：用海藻印一张蓝晒。\n地点：印刷室")
    page.get_by_role("button", name="生成宣传套装").click()
    expect(page.get_by_role("alert")).to_be_visible()
    expect(page.locator('.cp-spread svg image[href^="data:image/"]')).to_have_count(3)
    expect(page.get_by_label("发布文案", exact=True)).to_have_value(re.compile("留下你自己的海藻轮廓"))
    page.close()


def test_optional_ai_review_sees_only_selected_format_and_exposes_no_invalid_score(studio):
    import base64
    from io import BytesIO
    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda r: r.fulfill(json={"ai": True, "vision_model": "reviewer"}))
    proofs = []

    def review(route):
        body = route.request.post_data_json
        with Image.open(BytesIO(base64.b64decode(body["jpeg"]))) as picture:
            proofs.append((body["format"], picture.size))
        if len(proofs) == 2:
            return route.fulfill(json={"summary":"未经验证"})
        route.fulfill(json={"model":"reviewer","summary":"日期与场地还可以更靠近。","priorities":[
            {"name":"文字层级","evidence":"日期位于下方","suggestion":"拉开时间与场地的字号差。"},
            {"name":"图像构图","evidence":"主体靠近边缘","suggestion":"为主体右侧留出空间。"}]})

    page.route("**/api/outreach/campaign-review", review)
    page.goto(url + "#campaign")
    page.get_by_role("button", name="放大查看").click()
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("button", name="社交方图").click()
    dialog.get_by_role("button", name="AI 审片", exact=True).click()
    expect(dialog.get_by_text("拉开时间与场地的字号差。")).to_be_visible()
    dialog.get_by_role("button", name="横版封面").click()
    dialog.get_by_role("button", name="AI 审片", exact=True).click()
    expect(dialog.get_by_role("alert")).to_contain_text("未返回完整审片意见")
    assert dialog.locator(".cp-art-review li").count() == 0
    assert proofs == [("square", (1080, 1080)), ("landscape", (1200, 675))]
    dialog.get_by_role("button", name="社交方图").click()
    expect(dialog.get_by_text("拉开时间与场地的字号差。")).to_be_visible()
    page.close()


def test_artwork_cdn_retry_after_reload_reuses_generation_and_exports(studio, tmp_path, monkeypatch):
    from hashlib import sha256
    from io import BytesIO

    import httpx
    from fastapi.testclient import TestClient
    from posterlab import campaign_artwork
    from posterlab.server import create_app

    monkeypatch.setenv("POSTERLAB_PROVIDER", "paratera")
    monkeypatch.setenv("PARATERA_IMAGE_MODEL", "test-image")
    monkeypatch.delenv("PARATERA_BASE_URL", raising=False)
    image = BytesIO()
    Image.new("RGB", (120, 120), "#f02675").save(image, "PNG")
    calls = []

    async def resolve(host):
        assert host == "storage.example.com"
        return "93.184.215.14"

    def upstream(request):
        calls.append(request.method)
        if request.method == "POST":
            return httpx.Response(200, json={"data": [{"url": "https://storage.example.com/art.png"}]})
        return httpx.Response(503) if calls.count("GET") == 1 else httpx.Response(200, content=image.getvalue())

    monkeypatch.setattr(campaign_artwork, "_public_address", resolve)
    app = create_app(tmp_path, api_key="test", transport=httpx.MockTransport(upstream), serve_site=False)
    browser, url = studio
    page = browser.new_page()
    requests = []
    with TestClient(app) as api:
        def proxy(route):
            request = route.request
            if request.method == "GET":
                response = api.get("/api/status")
            else:
                requests.append((request.headers["idempotency-key"], request.post_data))
                response = api.post("/api/outreach/artwork", json=request.post_data_json,
                                    headers={"Idempotency-Key": requests[-1][0]})
            route.fulfill(status=response.status_code, headers=dict(response.headers), body=response.content)

        page.route("**/api/status", proxy)
        page.route("**/api/outreach/artwork", proxy)
        page.goto(url + "#campaign")
        page.get_by_label("使用模型编排", exact=False).uncheck()
        page.locator("#cp-notice").fill("秋夜设计书展\n简介：翻阅独立设计刊物。")
        page.get_by_role("button", name="生成并预览").click()
        page.get_by_role("dialog").get_by_role("button", name="关闭").click()
        generate = page.get_by_role("button", name="生成主视觉", exact=True)
        generate.click()
        expect(page.get_by_role("alert")).to_contain_text("重试将继续取图")
        entry = page.evaluate("""() => Object.keys(sessionStorage)
          .filter(k => k.startsWith('posterlab:campaign-artwork:'))
          .map(k => [k, JSON.parse(sessionStorage[k])])""")
        assert len(entry) == 1 and not entry[0][0].endswith(":draft")
        token, body = requests[0]
        assert entry[0][1] == {"digest": sha256(body.encode()).hexdigest(), "key": token}
        page.reload()
        generate.click()
        images = page.locator('.cp-spread svg image[href^="data:image/"]')
        expect(images).to_have_count(3)
        assert requests == [(token, body)] * 2
        assert calls == ["POST", "GET", "GET"]
        assert page.evaluate("key => sessionStorage.getItem(key)", entry[0][0]) is None
        page.reload()
        expect(images).to_have_count(3)
        with page.expect_download() as download:
            page.get_by_role("button", name="下载整套 ZIP").click()

    with ZipFile(download.value.path()) as archive:
        project = json.loads(archive.read("project.posterlab.json"))
        hero = project["assets"][project["current"]["heroId"]]
        assert hero["license"] == "AI 生成的活动主视觉"
        # Sample the photo inside each layout to check the exported pixels too.
        for name, dimensions, point in (
            ("竖版海报.png", (1080, 1440), (850, 920)),
            ("社交方图.png", (1080, 1080), (340, 770)),
            ("横版封面.png", (1920, 1080), (1400, 670)),
        ):
            with Image.open(archive.open(name)) as output:
                assert output.size == dimensions
                red, green, blue = output.convert("RGB").getpixel(point)
                assert red > 2 * green and red > 1.4 * blue
    page.close()


def test_activity_case_opens_independent_editable_copies_from_the_preview_zip(studio):
    browser, url = studio
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.route("**/api/**", lambda route: route.abort())
    archives = []
    page.on("request", lambda request: archives.append(request.url) if request.url.endswith("/kits/bookfair.zip") else None)
    page.add_init_script("""const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'projects' && window.failCopySave) {
          window.failCopySave = false;
          throw new DOMException('storage full', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };""")
    page.goto(url + "#collection/bookfair")
    page.get_by_role("button", name="社交方图", exact=True).click()
    edit = page.get_by_role("button", name="编辑这套海报")
    expect(edit).to_be_enabled()
    page.evaluate("window.failCopySave = true")
    edit.click()
    expect(page.get_by_role("alert")).to_contain_text("保存副本失败")
    edit.evaluate("button => { button.click(); button.click(); }")
    art = page.locator(".cs-art")
    title = art.locator('[data-layer="title"]')
    expect(title).to_have_text("秋夜设计书展")
    page.wait_for_function("location.hash === '#studio/square'")
    for ratio, viewbox in (("3:4", "0 0 1080 1440"), ("16:9", "0 0 1920 1080"), ("1:1", "0 0 1080 1080")):
        page.get_by_role("button", name=ratio, exact=True).click()
        expect(art.locator("svg").first).to_have_attribute("viewBox", viewbox)
        expect(art.locator('image[href^="data:image/"]').first).to_be_visible()
    title.click()
    page.get_by_label("修改图层文字").fill("周末绘本书展")
    expect(title).to_have_text("周末绘本书展")
    expect(page.locator(".cs-status")).to_contain_text("已自动保存")
    assert len(archives) == 1

    page.goto(url + "#collection/bookfair")
    edit.click()
    expect(title).to_have_text("秋夜设计书展")
    page.get_by_role("button", name="我的作品").click()
    expect(page.get_by_role("button", name="打开作品 秋夜设计书展", exact=True)).to_have_count(1)
    expect(page.get_by_role("button", name="打开作品 周末绘本书展", exact=True)).to_have_count(1)
    assert len(archives) == 2
    page.goto(url + "#collection/bookfair")
    page.get_by_role("button", name="街区咖啡日", exact=True).click()
    edit.click()
    expect(title).to_have_text("街区咖啡日")
    page.close()


@pytest.mark.parametrize("failed_stage", ["paper", "paper-artwork"])
def test_paper_preserves_successful_stage_when_only_one_retry_is_needed(studio, failed_stage):
    """A text-service 429 must not discard and regenerate a paid image, or vice versa."""
    import base64
    from io import BytesIO

    browser, url = studio
    page = browser.new_page()
    page.route("**/api/status", lambda r: r.fulfill(json={"ai": True, "artwork_model": "fixture-image"}))
    img = BytesIO()
    Image.new("RGB", (40, 40), "#206154").save(img, "WEBP")
    art = {"model": "fixture-image", "data_url": "data:image/webp;base64," + base64.b64encode(img.getvalue()).decode()}
    copy = {"provider": "Paratera", "model": "fixture-writer", "headline": "城市树荫，能降多少温？",
            "red":"树下有多凉？\n\n四座公园的测量。", "x":["Measuring shade in four parks."],
            "wechat":"测量树荫", "moments":"公园的测量记录", "evidence_ids":{}}
    keys = {name:[] for name in ("paper-reading","paper-layout","paper","paper-artwork")}

    def models(route):
        stage = route.request.url.rsplit("/", 1)[-1]
        keys[stage].append(route.request.headers["idempotency-key"])
        if stage=="paper-reading":
            route.fulfill(json=research_reading_fixture(route.request.post_data_json))
        elif stage=="paper-layout":
            route.fulfill(json=research_layout_fixture())
        elif stage == failed_stage and len(keys[stage]) == 1:
            if stage == "paper":
                route.fulfill(status=429, json={"detail": "文案通道暂忙"})
            else:
                route.fulfill(status=502, headers={"X-PosterLab-Reusable": "1"}, json={"detail": "插图等待下载"})
        else:
            route.fulfill(json=copy if stage == "paper" else art)

    page.route("**/api/outreach/*", models)
    page.goto(url + "#papers/import")
    dialog = page.get_by_role("dialog")
    dialog.get_by_role("button", name="手动填写标题和摘要").click()
    dialog.get_by_label("论文标题").fill("Park shade")
    dialog.get_by_label("摘要或论文原文").fill("Four city parks were surveyed during summer.")
    dialog.get_by_role("button", name="生成四套宣传材料").click()
    expect(dialog).to_have_count(0)
    assert all(len(calls)==1 for calls in keys.values())
    page.reload()
    expect(page.get_by_role("button",name="继续未完成的步骤")).to_be_visible()
    if failed_stage=="paper":
        expect(page.locator(".pub-art-credit")).to_contain_text("fixture-image")
    else:
        expect(page.locator(".pr-copy")).to_contain_text("四座公园")
    page.get_by_role("button",name="继续未完成的步骤").click()
    expect(page.get_by_role("region",name="海报制作记录")).to_contain_text("6 项已执行")
    expect(page.get_by_role("button",name="继续未完成的步骤")).to_have_count(0)
    expect(page.locator(".pub-art-credit")).to_contain_text("fixture-image")
    if failed_stage == "paper-artwork":
        assert keys["paper-artwork"][0] == keys["paper-artwork"][1]
    expect(page.locator(".pr-copy")).to_contain_text("四座公园")
    assert len(keys[failed_stage]) == 2
    assert sum(len(v) for v in keys.values()) == 5
    page.close()


def test_paper_drawio_exports_editable_text_and_original_figure_at_channel_size(studio):
    import base64
    from io import BytesIO
    from xml.etree import ElementTree

    browser, url = studio
    page = browser.new_page()
    page.goto(url + "#papers")
    expect(page.locator(".pub-proof canvas")).to_be_visible()
    with page.expect_download() as sample:
        page.get_by_role("button", name="下载可编辑 Draw.io").click()
    sample_xml = ElementTree.parse(sample.value.path())
    assert sample_xml.find(".//UserObject[@name='海报标题']/mxCell").get("style").startswith("text;")
    assert sample_xml.find(".//UserObject[@name='Figure 2 · 原论文第 4 页']") is not None
    assert sample_xml.find(".//UserObject[@name='Table 1 · 原论文第 7 页']") is not None

    def image(format):
        buf = BytesIO()
        Image.new("RGB", (40, 15), "#668866").save(buf, format)
        return "data:image/" + format.lower() + ";base64," + base64.b64encode(buf.getvalue()).decode()

    fig = image("JPEG")
    paper = {"id":"drawio-qa", "title":"Why compare shade?", "headline":"树荫下的测量", "source":"",
             "body":"Four city parks were measured in summer.", "sample":False,
             "edits":{}, "evidence":[{"quote":"Four city parks were measured in summer.","line":"四座公园。"}],
             "figure":{"data":fig,"credit":"Figure 1 · 原论文第 2 页"},
             "artwork":{"data":image("WEBP"),"model":"test-image"}, "coverLine":"夏季测量覆盖四座公园。"}
    page.evaluate("(p) => localStorage.setItem('posterlab.paper.v1',JSON.stringify(p))", paper)
    page.reload()
    page.get_by_role("button", name="公众号", exact=True).click()
    with page.expect_download() as download:
        page.get_by_role("button", name="下载可编辑 Draw.io").click()
    assert download.value.suggested_filename.endswith("公众号.drawio")
    doc = ElementTree.parse(download.value.path())
    model = doc.find(".//mxGraphModel")
    assert (model.get("pageWidth"), model.get("pageHeight")) == ("1800", "766")
    objects = {item.get("name"): item for item in model.findall(".//UserObject")}
    assert objects["宣传导语"].find("mxCell").get("style").startswith("text;")
    assert "夏季测量" in objects["宣传导语"].get("label"), objects["宣传导语"].attrib
    assert "AI 主视觉 · test-image" in objects and "原图署名" in objects
    original = objects["论文原图 · Figure 1 · 原论文第 2 页"].find("mxCell")
    assert fig.replace(";base64,", ",") in original.get("style")
    geometry = original.find("mxGeometry")
    assert float(geometry.get("width"))/float(geometry.get("height")) == pytest.approx(40/15, rel=1e-4)
    page.close()


def test_public_research_editor_keeps_dragged_text_and_replaced_source_on_reload(studio):
    from xml.etree import ElementTree

    browser, url = studio
    page = browser.new_page(viewport={"width": 1440, "height": 950})
    page.goto(url + "#papers/example/clashbench")
    editor = page.get_by_role("dialog", name="编辑海报图层")
    layers = editor.get_by_label("当前图层")
    layers.select_option("title")
    editor.get_by_label("文字内容").fill("ClashBench · 手动编辑的标题")
    title = editor.get_by_role("button", name="移动海报标题", exact=True)
    pos = title.bounding_box()
    x, y = pos["x"] + pos["width"] / 3, pos["y"] + pos["height"] / 2
    old_x = int(editor.get_by_label("水平位置").input_value())
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 18, y + 5, steps=4)
    page.mouse.up()
    assert int(editor.get_by_label("水平位置").input_value()) > old_x
    title.press("Shift+ArrowRight")
    saved_x = int(editor.get_by_label("水平位置").input_value())

    layers.select_option("method-image")
    editor.get_by_label("论文图片与表格").select_option("table-1-p7")
    editor.get_by_role("button", name="替换当前图片").click()
    layers.select_option("method-source")
    assert "Table 1" in editor.get_by_label("文字内容").input_value()
    page.keyboard.press("Escape")
    page.reload()
    page.get_by_role("button", name="编辑海报图层", exact=True).click()
    layers.select_option("title")
    assert editor.get_by_label("文字内容").input_value() == "ClashBench · 手动编辑的标题"
    assert int(editor.get_by_label("水平位置").input_value()) == saved_x
    page.keyboard.press("Escape")
    with page.expect_download() as item:
        page.get_by_role("button", name="下载可编辑 Draw.io").click()
    model = ElementTree.parse(item.value.path()).find(".//mxGraphModel")
    title_xml = model.find(".//UserObject[@name='海报标题']")
    assert abs(float(title_xml.find(".//mxGeometry").get("x")) - saved_x) < 1
    clips = model.findall(".//UserObject[@name='Table 1 · 原论文第 7 页']")
    assert len(clips) == 2 and clips[0].find("mxCell").get("style") == clips[1].find("mxCell").get("style")
    page.close()


def test_invited_workspaces_keep_private_drafts_images_and_reviews_separate(studio):
    from urllib.parse import urlsplit

    browser, url = studio
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = context.new_page()
    page.set_default_timeout(7000)
    demo = json.loads((SITE / 'demo/manifest.json').read_text())
    job = demo['/generations'][0]
    uid = job['id']
    calls, unscoped, errors = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def mounted(route):
        path = urlsplit(route.request.url).path
        match = re.fullmatch(r'/t/(lab-[ab])/(app|api)/(.*)', path)
        if not match:
            unscoped.append(path)
            return route.fulfill(status=404)
        group, area, rest = match.groups()
        if area == 'app':
            return route.fulfill(response=route.fetch(url=url + rest))
        endpoint = '/' + rest
        calls.append((group, endpoint))
        if endpoint == f'/generations/{uid}/image':
            return route.fulfill(path=SITE / job['image_url'])
        if endpoint == '/generations':
            return route.fulfill(json=[{**job, 'brief': '标题：' + group + ' 海报',
                                        'image_url': f'/api/generations/{uid}/image'}])
        return route.fulfill(json=demo.get(endpoint))

    page.route('**/t/**', mounted)
    page.route('**/api/**', mounted)
    page.goto(url)
    page.evaluate('''() => {
      localStorage.setItem('posterlab.chat.draft', JSON.stringify('owner secret'));
      localStorage.setItem('posterlab.works.v1', JSON.stringify([{id:'owner',theme:'paper',fields:{title:'Owner legacy'}}]));
    }''')
    for group in ('lab-a', 'lab-b'):
        mount = url + f't/{group}/app/'
        page.goto(mount + '#studio')
        composer = page.get_by_label('发送给 PosterLab 的消息')
        expect(composer).to_have_value('')
        composer.fill(group + ' chat')
        page.get_by_role('button', name='需求助手', exact=True).click()
        idea = page.get_by_label('你想做什么？')
        assert idea.input_value() != 'lab-a private plan'
        idea.fill(group + ' private plan')
        page.keyboard.press('Escape')
        if not page.locator('.chat-sidebar').is_visible():
            page.get_by_role('button', name='打开对话列表').click()
        assert (group, '/generations') in calls, (calls, unscoped, errors)
        expect(page.locator('.thread-list')).to_contain_text(group + ' 海报')
        page.locator('.thread-list button').filter(has_text=group + ' 海报').click()
        prefix = f'/t/{group}/api/generations/{uid}'
        expect(page.locator('.canvas-panel img').first).to_have_attribute('src', prefix + '/image')
        page.get_by_role('button', name='作品详情', exact=True).click()
        expect(page.get_by_role('link', name='下载 HTML 源文件包')).to_have_attribute('href', prefix + '/package')
        page.keyboard.press('Escape')
        page.get_by_role('button', name=re.compile('AI 评测海报|查看评测')).click()
        expect(page.get_by_role('dialog').get_by_role('img', name='本次评测对应版本')).to_have_attribute('src', prefix + '/image')
        assert (group, '/evaluations/for/' + uid) in calls
        page.keyboard.press('Escape')
        page.goto(mount + '#papers/import')
        dialog = page.get_by_role('dialog')
        dialog.get_by_role('button', name='手动填写标题和摘要').click()
        dialog.get_by_label('论文标题').fill(group + ' paper')
        dialog.get_by_label('摘要或论文原文').fill('Four parks were observed in summer.')
        dialog.get_by_role('button', name='生成四套本地摘录稿').click()
        expect(dialog).to_be_hidden()
        page.get_by_role('button', name='我的论文').click()
        expect(dialog.get_by_role('button', name=group+' paper')).to_be_visible()
        if group == 'lab-b':
            expect(dialog.get_by_role('button', name='lab-a paper')).to_have_count(0)
        page.evaluate("""group => localStorage.setItem('/t/' + group + ':posterlab.works.v1',
          JSON.stringify([{id:'legacy-test',theme:'paper',fields:{title:group + ' legacy'}}]))""", group)
        page.goto(mount + '?mode=templates#new?edition=afterglow&format=landscape')
        page.get_by_role('button',name='我的作品').click()
        expect(page.get_by_role('button',name='打开作品 Owner legacy')).to_have_count(0)
        expect(page.get_by_role('button',name='打开作品 ' + group + ' legacy')).to_be_visible()
    # Reload the first workspace in the very same tab. A manual navigation does
    # not clear sessionStorage, so this also exercises isolated tool drafts.
    page.goto(url + 't/lab-a/app/#studio')
    if not page.locator('.chat-sidebar').is_visible():
        page.get_by_role('button', name='打开对话列表').click()
    page.locator('.chat-sidebar').get_by_role('button',name='新对话',exact=True).click()
    page.get_by_role('button',name='需求助手',exact=True).click()
    expect(page.get_by_label('你想做什么？')).to_have_value('lab-a private plan')
    assert page.evaluate('JSON.parse(localStorage.getItem("posterlab.chat.draft"))') == 'owner secret'
    assert not unscoped and not errors
    context.close()
