import { OPS, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Paper } from "./paper-model";

type Box = { left: number; top: number; right: number; bottom: number };
type TextBox = Box & { text: string; baseline: number };
type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;
type Figure = NonNullable<Paper["figure"]>;

// Require a caption marker, not a sentence such as "Figure 1 shows…".
const firstFigure =
  /^(?:fig(?:ure)?\.?\s*0?1|图\s*[一1])\s*[.:：|｜丨、—–-](?!\d)/iu;
const anotherFigure =
  /^(?:fig(?:ure)?\.?\s*[2-9]\d*|图\s*[二三四五六七八九2-9]\d*)\s*[.:：|｜丨、—–-]/iu;
const figureStart = /^(?:fig(?:ure)?\.?\b|图)/iu;
const pageScanLimit = 12;

function textBoxes(runs: TextItem[], viewport: PageViewport): TextBox[] {
  // PDF.js measures a rotated margin stamp along its own baseline. Including
  // that width as a horizontal label would pull the crop into the page margin.
  return runs
    .filter(
      (r) =>
        r.str.trim() && Math.abs(r.transform[1]) <= Math.abs(r.transform[0]),
    )
    .map((r) => {
      const [x, y] = viewport.convertToViewportPoint(
        r.transform[4],
        r.transform[5],
      );
      const h = Math.abs(r.height * viewport.scale);
      return {
        left: x,
        right: x + r.width * viewport.scale,
        top: y - h * 0.85,
        bottom: y + h * 0.18,
        baseline: y,
        text: r.str.trim(),
      };
    });
}

function captions(text: TextBox[], pattern: RegExp): TextBox[] {
  const candidates: TextBox[] = [];
  for (const start of text.filter((r) => figureStart.test(r.text))) {
    let right = start.right;
    let label = start.text;
    const h = start.bottom - start.top;
    const neighbors = text
      .filter(
        (r) =>
          r !== start &&
          r.left >= start.left &&
          Math.abs(r.baseline - start.baseline) <= h * 0.45,
      )
      .sort((a, b) => a.left - b.left);
    for (const next of neighbors) {
      if (next.left - right > h * 1.6 || figureStart.test(next.text)) break;
      label += " " + next.text;
      right = Math.max(right, next.right);
    }
    if (pattern.test(label)) candidates.push({ ...start, right, text: label });
  }
  return candidates;
}

const painted = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
  OPS.paintInlineImageXObjectGroup,
  OPS.paintImageMaskXObjectGroup,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObjectRepeat,
  OPS.constructPath,
  OPS.rawFillPath,
  OPS.shadingFill,
  OPS.stroke,
  OPS.fill,
  OPS.eoFill,
  OPS.fillStroke,
]);

async function artworkBoxes(page: PDFPageProxy, width: number, height: number) {
  const ops = await page.getOperatorList();
  const bounds = page.recordedBBoxes;
  if (!bounds) return [];
  const boxes: Box[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (!painted.has(ops.fnArray[i]) || bounds.isEmpty(i)) continue;
    const b = {
      left: bounds.minX(i) * width,
      right: bounds.maxX(i) * width,
      top: bounds.minY(i) * height,
      bottom: bounds.maxY(i) * height,
    };
    // Ignore full-page paint or clip paths and tiny isolated marks.
    if (
      (b.right - b.left) * (b.bottom - b.top) > width * height * 0.7 ||
      Math.max(b.right - b.left, b.bottom - b.top) < 4
    )
      continue;
    boxes.push(b);
  }
  return boxes;
}

function combined(a: Box, b: Box): Box {
  return {
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

function locateFigure(
  cap: TextBox,
  siblings: TextBox[],
  text: TextBox[],
  shapes: Box[],
  w: number,
  h: number,
): Box | undefined {
  const before = text.filter(
    (r) => r.bottom < cap.top && r.bottom > cap.top - h * 0.5,
  );
  const prose = before.filter(
    (r) => r.text.length > 25 && r.right - r.left > 85,
  );
  // Wrapfig can sit in a narrow strip alongside a full paragraph.
  const leftColumn =
    cap.left < w * 0.36 &&
    cap.right < w * 0.57 &&
    prose.filter((r) => r.left > w * 0.49).length >= 2;
  const rightColumn =
    cap.left > w * 0.48 &&
    prose.filter((r) => r.right < cap.left + 3).length >= 2;
  const lowerX = rightColumn ? Math.max(w * 0.48, cap.left - 2) : 0;
  const adjacent = siblings.find(
    (r) => r.left > cap.right && Math.abs(r.baseline - cap.baseline) < 16,
  );
  const upperX = adjacent
    ? Math.max(cap.right, Math.min(w / 2, adjacent.left - 2))
    : leftColumn
      ? w * 0.51
      : w;
  const nearby = shapes
    .filter(
      (b) =>
        b.top < cap.top - 5 &&
        b.bottom <= cap.top + 3 &&
        b.bottom >= cap.top - h * 0.68 &&
        b.left >= lowerX - 2 &&
        b.right <= upperX + 2,
    )
    .sort((a, b) => b.bottom - a.bottom);

  // Row groups keep multipart figures together while stopping at a paragraph
  // or a distinct figure. All coordinates here are PDF display points.
  let group: Box | undefined;
  for (const box of nearby) {
    const gap = (group?.top ?? cap.top) - box.bottom;
    if (group && gap > 28) break;
    if (!group && gap > 55) break;
    // A shaded abstract or other body-text panel can abut the actual chart.
    if (
      prose.filter(
        (p) =>
          p.text.length >= 58 &&
          p.left >= box.left - 2 &&
          p.right <= box.right + 2 &&
          p.top > box.top &&
          p.bottom < box.bottom,
      ).length >= 2
    )
      continue;
    if (
      gap > 6 &&
      prose.some(
        (p) =>
          p.left >= lowerX - 2 &&
          p.right <= upperX + 2 &&
          p.top > box.bottom - 1 &&
          p.bottom < (group?.top ?? cap.top) + 1,
      )
    )
      break;
    group = group ? combined(group, box) : { ...box };
  }
  if (!group || group.right - group.left < 40 || group.bottom - group.top < 28)
    return;
  const area = group;
  // Axis titles, panel labels and legends are often PDF text, outside the
  // raster or vector artwork. Preserve these in the crop without the caption.
  for (const r of before) {
    if (
      r.text.length > 80 ||
      r.left < lowerX - 2 ||
      r.right > upperX + 2 ||
      r.right < area.left - 20 ||
      r.left > area.right + 20 ||
      r.bottom < area.top - 14 ||
      r.top > area.bottom + 18
    )
      continue;
    group = combined(group, r);
  }
  return {
    left: Math.max(lowerX, group.left - 4),
    right: Math.min(upperX, group.right + 4),
    top: Math.max(0, group.top - 4),
    bottom: Math.min(cap.top - 1, group.bottom + 4),
  };
}

function visibleInk(canvas: HTMLCanvasElement): Box | undefined {
  // PDF drawing operations can include off-screen content masked by a clip.
  // Trim the white area left by such invisible paths from the rendered crop.
  const { width, height } = canvas;
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, width, height).data;
  let left = width,
    right = -1,
    top = height,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (Math.min(pixels[at], pixels[at + 1], pixels[at + 2]) > 227) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right - left < 24 || bottom - top < 20) return;
  return {
    left: Math.max(0, left - 5),
    top: Math.max(0, top - 5),
    right: Math.min(width, right + 6),
    bottom: Math.min(height, bottom + 6),
  };
}

async function extractPage(page: PDFPageProxy): Promise<Figure | undefined> {
  // Request an unrotated viewport so text, operation bounds and final raster
  // share the same orientation even when the PDF has a rotated page box.
  const base = page.getViewport({ scale: 1, rotation: 0 });
  const { items } = await page.getTextContent();
  const text = textBoxes(
    items.filter((r): r is TextItem => "str" in r),
    base,
  );
  const matches = captions(text, firstFigure);
  if (!matches.length) return;
  const siblings = captions(text, anotherFigure);
  const viewport = page.getViewport({
    scale: Math.min(3, 2300 / Math.max(base.width, base.height)),
    rotation: 0,
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({
      canvas,
      viewport,
      recordOperations: true,
      background: "white",
    }).promise;
    const shapes = await artworkBoxes(page, base.width, base.height);
    for (const cap of matches) {
      const crop = locateFigure(
        cap,
        siblings,
        text,
        shapes,
        base.width,
        base.height,
      );
      if (!crop) continue;
      const scale = viewport.scale / base.scale;
      const width = (crop.right - crop.left) * scale;
      const height = (crop.bottom - crop.top) * scale;
      const fit = Math.min(1, 1500 / Math.max(width, height));
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(width * fit));
      out.height = Math.max(1, Math.round(height * fit));
      out
        .getContext("2d")!
        .drawImage(
          canvas,
          crop.left * scale,
          crop.top * scale,
          width,
          height,
          0,
          0,
          out.width,
          out.height,
        );
      const ink = visibleInk(out);
      if (!ink) continue;
      // Render the selected rectangle again from the PDF at poster resolution.
      // Enlarging the first page raster would soften small diagrams and labels.
      const x = crop.left + ink.left / (fit * scale);
      const y = crop.top + ink.top / (fit * scale);
      const w = (ink.right - ink.left) / (fit * scale);
      const h = (ink.bottom - ink.top) / (fit * scale);
      const zoom = Math.min(12, 1500 / Math.max(w, h));
      out.width = Math.max(1, Math.ceil(w * zoom));
      out.height = Math.max(1, Math.ceil(h * zoom));
      await page.render({
        canvas: out,
        viewport: page.getViewport({ scale: zoom, rotation: 0 }),
        transform: [1, 0, 0, 1, -x * zoom, -y * zoom],
        background: "white",
      }).promise;
      let data = out.toDataURL("image/jpeg", 0.92);
      if (data.length > 2400000) data = out.toDataURL("image/jpeg", 0.78);
      if (data.length <= 2400000)
        return {
          data,
          credit: "Figure 1 · 原论文第 " + page.pageNumber + " 页",
        };
    }
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export async function firstPaperFigure(doc: PDFDocumentProxy) {
  for (let i = 1; i <= Math.min(pageScanLimit, doc.numPages); i++) {
    const page = await doc.getPage(i);
    try {
      const figure = await extractPage(page);
      if (figure) return figure;
    } finally {
      page.cleanup();
    }
  }
}
