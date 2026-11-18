import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import {
  printedFrontmatter,
  metadataAuthor,
  metadataTitle,
} from "./paper-frontmatter";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { firstPaperFigure } from "./pdf-figure";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import {
  abstractBeforeFigure,
  extractSections,
  pdfPageText,
  pdfProse,
  unwrapPdfWords,
} from "./paper-sections";
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
    const info = meta?.info as { Title?: string; Author?: string } | undefined;
    const title =
      metadataTitle(info?.Title) ||
      metadataTitle(meta?.metadata?.get("dc:title"));
    const author =
      metadataAuthor(info?.Author) ||
      metadataAuthor(meta?.metadata?.get("dc:creator"));
    const pages: string[] = [];
    let printed = { title: "", byline: "" };
    // Limit text extraction to the two pages the import form advertises.
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      const runs = items.filter((item): item is TextItem => "str" in item);
      if (i === 1) printed = printedFrontmatter(runs, page.view);
      pages.push(pdfPageText(runs, page.view, i));
      page.cleanup();
    }
    const text = unwrapPdfWords(pages.join("\n")).trim();
    if (text.length < 20)
      throw Error("没有读到文本层。扫描版 PDF 可先做 OCR，或在这里粘贴摘要。");
    const parsed = extractSections(text, title || printed.title);
    return {
      ...parsed,
      // A malformed graphic must not prevent a successful text import.
      figure: await firstPaperFigure(doc).catch(() => undefined),
      abstract: pdfProse(
        parsed.namedAbstract
          ? abstractBeforeFigure(parsed.abstract)
          : parsed.abstract,
      ),
      introduction: pdfProse(
        parsed.introduction
          .replace(
            /^(?:Fig(?:ure)?\.?\s*\d+|图\s*\d+)\s*[.:：|丨｜—–-]\s*$/gimu,
            "",
          )
          .replace(/\n{2,}/g, "\n")
          .trim(),
      ),
      pagesRead: pages.length,
      hasLaterPages: doc.numPages > pages.length,
      byline: (author || printed.byline).slice(0, 240),
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
