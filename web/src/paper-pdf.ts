import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { extractSections } from "./paper-sections";
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
function printedTitle(items: TextItem[], page: number[]) {
  const top = page[3],
    height = top - page[1];
  const horizontal = items.filter(
    (item) =>
      item.str.trim() &&
      Math.abs(item.transform[0]) > Math.abs(item.transform[1]),
  );
  const heights = horizontal
    .map((item) => item.height)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)] || 0;
  const eligible = horizontal.filter(
    (item) =>
      item.transform[5] > top - height * 0.55 &&
      item.height >= typical * 1.12 &&
      /[\p{L}]{2}/u.test(item.str) &&
      !/copyright|arxiv:|preprint|https?:|proceedings|permission|published by/i.test(
        item.str,
      ),
  );
  const first = eligible.reduce<TextItem | undefined>(
    (best, item) => (!best || item.height > best.height * 1.02 ? item : best),
    undefined,
  );
  if (!first) return "";
  const start = horizontal.indexOf(first),
    words = [];
  let lastY = first.transform[5];
  for (const item of horizontal.slice(start)) {
    if (
      Math.abs(item.height - first.height) > first.height * 0.08 ||
      Math.abs(item.transform[5] - lastY) > first.height * 1.9
    )
      break;
    words.push(item.str.trim());
    lastY = item.transform[5];
  }
  return words.join(" ").slice(0, 500);
}

export async function readPdf(file: File) {
  const task = await openPdf(file);
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => null);
    const title =
      (meta?.info as { Title?: string } | undefined)?.Title?.trim() || "";
    const pages: string[] = [];
    let displayTitle = "";
    // Limit text extraction to the two pages the import form advertises.
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      if (i === 1)
        displayTitle = printedTitle(
          items.filter((item): item is TextItem => "str" in item),
          page.view,
        );
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
      const pageText = lines.join("").replace(/ *\n+ */g, "\n");
      // Author contribution and licensing footnotes run to the end of the page,
      // including in PDFs whose accessibility reading order places headers last.
      const footer = pageText.search(
        /\n[ \t]*[∗*†‡][ \t]*(?:equal contribution|full author list|work (?:performed|done)|corresponding author)\b/i,
      );
      pages.push(footer >= 0 ? pageText.slice(0, footer) : pageText);
      page.cleanup();
    }
    const text = pages.join("\n").trim();
    if (text.length < 20)
      throw Error("没有读到文本层。扫描版 PDF 可先做 OCR，或在这里粘贴摘要。");
    const parsed = extractSections(
      text,
      /^(?:untitled|microsoft word|arxiv:)/i.test(title)
        ? displayTitle
        : title || displayTitle,
    );
    return {
      ...parsed,
      pagesRead: pages.length,
      hasLaterPages: doc.numPages > pages.length,
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
