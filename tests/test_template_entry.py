"""Check the offline homepage to editor handoff against the production build."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from PIL import Image
from playwright.sync_api import expect, sync_playwright

SITE = Path(__file__).resolve().parents[1] / "site"


def test_mobile_template_entry_save_reopen_and_png(tmp_path):
    handler = partial(SimpleHTTPRequestHandler, directory=SITE)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch()
                page = browser.new_page(viewport={"width": 390, "height": 844})
                page.goto(f"http://127.0.0.1:{server.server_port}/")
                page.get_by_label("海报主题", exact=True).fill("周末咖啡市集")
                page.get_by_role("button", name="开始排版").click()
                expect(page.get_by_label("活动标题", exact=True)).to_have_value("周末咖啡市集")
                page.get_by_role("button", name="导出物料").click()
                dialog = page.get_by_role("dialog")
                expect(dialog.get_by_role("button", name="下载作品")).to_be_disabled()
                dialog.get_by_role("button", name="请填写活动日期").click()
                date = page.get_by_label("活动日期", exact=True)
                expect(date).to_be_focused()
                date.fill("2026-11-28")
                page.get_by_label("活动时间", exact=True).fill("10:00–16:00")
                page.get_by_label("活动地点", exact=True).fill("创意园中庭")
                expect(page.get_by_text("已自动保存", exact=True)).to_be_visible()
                page.reload()
                expect(page.get_by_label("活动地点", exact=True)).to_have_value("创意园中庭")
                page.get_by_role("button", name="预览海报", exact=True).click()
                expect(page.get_by_role("img", name="海报预览")).to_be_visible()
                page.get_by_role("button", name="导出物料").click()
                with page.expect_download() as download:
                    page.get_by_role("button", name="下载作品").click()
                dest = tmp_path / "poster.png"
                download.value.save_as(dest)
                with Image.open(dest) as image:
                    assert image.format == "PNG" and image.size == (1080, 1440)
                browser.close()
        finally:
            server.shutdown()
            thread.join()
