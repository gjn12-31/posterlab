import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { prepareText } from "./paper-model";
GlobalWorkerOptions.workerSrc = worker;

export async function openPdf(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const resources = new URL(
    import.meta.env.BASE_URL + "paper-pdf/",
    location.href,
  ).href;
  return getDocument({
    data,
    cMapUrl: resources + "cmaps/",
    standardFontDataUrl: resources + "standard_fonts/",
    wasmUrl: resources + "wasm/",
    iccUrl: resources + "iccs/",
    cMapPacked: true,
    useWorkerFetch: true,
  });
}
export async function readPdf(file: File) {
  const task = await openPdf(file);
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => null);
    const title =
      (meta?.info as { Title?: string } | undefined)?.Title?.trim() || "";
    const pages: string[] = [];
    // The business input is the title and abstract. Do not collect an entire unpublished manuscript.
    for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      let lastY: number | undefined;
      const lines: string[] = [];
      for (const item of items) {
        if (!("str" in item)) continue;
        const y = item.transform[5];
        if (
          lastY !== undefined &&
          Math.abs(lastY - y) > Math.max(3, item.height * 0.6)
        )
          lines.push("\n");
        lines.push(item.str, item.hasEOL ? "\n" : "");
        lastY = y;
      }
      pages.push(lines.join("").replace(/ *\n+ */g, "\n"));
      page.cleanup();
    }
    const text = pages.join("\n").trim();
    if (text.length < 20)
      throw Error("没有读到文本层。扫描版 PDF 可先做 OCR，或在这里粘贴摘要。");
    const parsed = prepareText(
      text,
      /^(?:untitled|microsoft word|arxiv:)/i.test(title) ? "" : title,
    );
    return {
      ...parsed,
      byline: (
        (meta?.info as { Author?: string } | undefined)?.Author || ""
      ).slice(0, 240),
      title: parsed.title || file.name.replace(/\.pdf$/i, ""),
    };
  } catch (e) {
    if ((e as Error).name === "PasswordException")
      throw Error("PDF 受密码保护，请导入解锁后的文件或粘贴摘要。");
    throw e;
  } finally {
    await task.destroy();
  }
}
