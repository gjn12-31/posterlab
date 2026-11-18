import { OPS, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { PaperVisual } from "./paper-layout-model";

type Box = { left: number; top: number; right: number; bottom: number };
type TextBox = Box & { text: string; baseline: number };
type PageViewport = ReturnType<PDFPageProxy["getViewport"]>;
type VisualIndex = {
  page: number;
  label: string;
  kind: PaperVisual["kind"];
  caption: string;
  cap: TextBox;
};
const figureStart = /^(?:fig(?:ure)?\.?\b|table\b|图|表)/iu;
const marker =
  /^(fig(?:ure)?\.?|table|图|表)\s*(\d{1,3}|[IVXLCDM]+|[一二三四五六七八九十]+)\s*[.:：|｜丨、—–-](?!\d)/iu;

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
  // A separate line of prose beside this caption also identifies the other
  // column, even when that line is a figure reference rather than a caption.
  const beside = text.filter(
    (r) =>
      r.text.length > 25 &&
      Math.abs(r.baseline - cap.baseline) < (cap.bottom - cap.top) * 0.65,
  );
  // Wrapfig can sit in a narrow strip alongside a full paragraph.
  const leftColumn =
    cap.left < w * 0.36 &&
    cap.right < w * 0.57 &&
    (prose.filter((r) => r.left > w * 0.49).length >= 2 ||
      beside.some((r) => r.left > Math.max(cap.right + 8, w * 0.49)));
  const rightColumn =
    cap.left > w * 0.48 &&
    (prose.filter((r) => r.right < cap.left + 3).length >= 2 ||
      beside.some((r) => r.left < w * 0.36 && r.right < cap.left - 8));
  const peers = siblings.filter(
    (r) => Math.abs(r.baseline - cap.baseline) < 16,
  );
  const leftPeer = peers
    .filter((r) => r.right < cap.left)
    .sort((a, b) => b.right - a.right)[0];
  const rightPeer = peers
    .filter((r) => r.left > cap.right)
    .sort((a, b) => a.left - b.left)[0];
  const lowerX = leftPeer
    ? Math.min(cap.left, Math.max(w / 2, leftPeer.right + 2))
    : rightColumn
      ? Math.max(w * 0.48, cap.left - 2)
      : 0;
  const upperX = rightPeer
    ? Math.max(cap.right, Math.min(w / 2, rightPeer.left - 2))
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

function alignedRows(text: TextBox[]) {
  const rows: TextBox[][] = [];
  for (const item of [...text].sort(
    (a, b) => a.baseline - b.baseline || a.left - b.left,
  )) {
    const last = rows.at(-1);
    if (last && Math.abs(last[0].baseline - item.baseline) <= 2.3)
      last.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => row.sort((a, b) => a.left - b.left));
}

function columnBounds(cap: TextBox, text: TextBox[], width: number) {
  if (cap.left > width * 0.47) return { left: width * 0.475, right: width };
  if (
    cap.right < width * 0.53 &&
    text.some(
      (t) =>
        t.left >= width * 0.5 &&
        t.baseline >= cap.baseline - 4 &&
        t.baseline < cap.baseline + 65 &&
        t.text.length >= 20,
    )
  )
    return { left: 0, right: width * 0.51 };
  return { left: 0, right: width };
}

export function pageVisualIndex(
  page: PDFPageProxy,
  runs: TextItem[],
): VisualIndex[] {
  const base = page.getViewport({ scale: 1, rotation: 0 });
  const text = textBoxes(runs, base);
  return captions(text, marker).map((cap) => {
    const m = marker.exec(cap.text)!;
    const kind = /table|表/i.test(m[1]) ? "table" : "figure";
    const label = (kind === "figure" ? "Figure " : "Table ") + m[2];
    const area = columnBounds(cap, text, base.width);
    const rows = alignedRows(
      text.filter(
        (t) =>
          t.baseline > cap.baseline + 3 &&
          t.left >= area.left - 2 &&
          t.right <= area.right + 2,
      ),
    );
    let caption = cap.text,
      baseY = cap.baseline;
    const lineH = cap.bottom - cap.top;
    for (const row of rows.slice(0, 10)) {
      const phrase = row.map((t) => t.text).join(" ");
      if (
        row[0].baseline - baseY > lineH * 1.6 ||
        Math.abs(row[0].left - cap.left) > 20 ||
        row.some((t) => Math.abs(t.bottom - t.top - lineH) > lineH * 0.28) ||
        phrase.length < 11 ||
        marker.test(phrase) ||
        row.filter((t) => /^[-+]?\d/.test(t.text)).length >= 2 ||
        (/[.!?。]$/.test(caption) && row[0].baseline - baseY > lineH * 1.24)
      )
        break;
      caption += " " + phrase;
      baseY = row[0].baseline;
    }
    return {
      page: page.pageNumber,
      label,
      kind,
      caption: caption.slice(0, 1600),
      cap,
    };
  });
}

function locateTable(
  cap: TextBox,
  text: TextBox[],
  shapes: Box[],
  width: number,
  height: number,
) {
  const area = columnBounds(cap, text, width);
  const rows = alignedRows(
    text.filter((t) => t.left >= area.left - 2 && t.right <= area.right + 2),
  );
  const numeric = (row: TextBox[]) =>
    row.filter((t) => /^[−–+<>≈~(]?\d+(?:[.,]\d+)*(?:%|[)†‡*])?$/.test(t.text))
      .length >= 2 ||
    row.some(
      (t) =>
        (t.text.match(/(?:^|\s)[−+]?\d+(?:\.\d+)?(?=\s|$)/g) || []).length >= 3,
    );
  const indexed = rows
    .map((row, i) => ({ row, i, delta: row[0].baseline - cap.baseline }))
    .filter(({ row, delta }) => numeric(row) && Math.abs(delta) < height * 0.7);
  // Nearby dense numeric rows anchor the table independently of its caption
  // position. Stop at prose and large gaps instead of grabbing the next section.
  const anchor = indexed.sort(
    (a, b) => Math.abs(a.delta) - Math.abs(b.delta),
  )[0];
  if (!anchor || Math.abs(anchor.delta) > 145) return;
  const below = anchor.delta > 0;
  let lo = anchor.i,
    hi = lo;
  const belongs = (row: TextBox[], neighbor: TextBox[]) => {
    if (
      Math.abs(row[0].baseline - neighbor[0].baseline) > 24 ||
      row.some((t) => marker.test(t.text))
    )
      return false;
    const y = row[0].baseline;
    if (below ? y <= cap.baseline + 2 : y >= cap.baseline - 2) return false;
    if (numeric(row)) return true;
    const phrase = row.map((t) => t.text).join(" ");
    return (
      phrase.length < 145 &&
      !row.some((t) => t.text.length > 56) &&
      (row.length >= 2 || phrase.length < 28) &&
      !/[.。]$/.test(phrase)
    );
  };
  while (lo > 0 && belongs(rows[lo - 1], rows[lo])) lo--;
  while (hi + 1 < rows.length && belongs(rows[hi + 1], rows[hi])) hi++;
  if (!rows.slice(lo, hi + 1).some(numeric) || hi - lo < 2) return;
  const entries = rows.slice(lo, hi + 1).flat();
  let crop = entries.slice(1).reduce<Box>(combined, entries[0]);
  const rules = shapes.filter(
    (b) =>
      b.right - b.left > (crop.right - crop.left) * 0.35 &&
      b.bottom - b.top < 4 &&
      b.left >= area.left - 4 &&
      b.right <= area.right + 4 &&
      b.top >= crop.top - 10 &&
      b.bottom <= crop.bottom + 10,
  );
  for (const b of rules) crop = combined(crop, b);
  return {
    left: Math.max(area.left, crop.left - 4),
    top: Math.max(0, crop.top - 3),
    right: Math.min(area.right, crop.right + 4),
    bottom: Math.min(height, crop.bottom + 3),
  };
}

async function extractPage(
  page: PDFPageProxy,
  targets: VisualIndex[],
  siblings: VisualIndex[],
): Promise<PaperVisual[]> {
  const base = page.getViewport({ scale: 1, rotation: 0 });
  const { items } = await page.getTextContent();
  const text = textBoxes(
    items.filter((r): r is TextItem => "str" in r),
    base,
  );
  const viewport = page.getViewport({
    scale: Math.min(2, 1600 / Math.max(base.width, base.height)),
    rotation: 0,
  });
  const canvas = document.createElement("canvas"),
    out = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const results: PaperVisual[] = [];
  try {
    await page.render({
      canvas,
      viewport,
      recordOperations: true,
      background: "white",
    }).promise;
    const shapes = await artworkBoxes(page, base.width, base.height);
    for (const v of targets) {
      const crop =
        v.kind === "table"
          ? locateTable(v.cap, text, shapes, base.width, base.height)
          : locateFigure(
              v.cap,
              siblings.filter((s) => s !== v).map((s) => s.cap),
              text,
              shapes,
              base.width,
              base.height,
            );
      if (!crop) continue;
      const scale = viewport.scale;
      const width = (crop.right - crop.left) * scale,
        height = (crop.bottom - crop.top) * scale;
      out.width = Math.max(1, Math.ceil(width));
      out.height = Math.max(1, Math.ceil(height));
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
      const x = crop.left + ink.left / scale,
        y = crop.top + ink.top / scale;
      const w = (ink.right - ink.left) / scale,
        h = (ink.bottom - ink.top) / scale;
      const zoom = Math.min(
        12,
        (v.kind === "table" ? 2300 : 1600) / Math.max(w, h),
      );
      out.width = Math.max(1, Math.ceil(w * zoom));
      out.height = Math.max(1, Math.ceil(h * zoom));
      await page.render({
        canvas: out,
        viewport: page.getViewport({ scale: zoom, rotation: 0 }),
        transform: [1, 0, 0, 1, -x * zoom, -y * zoom],
        background: "white",
      }).promise;
      let data = out.toDataURL("image/jpeg", 0.93);
      if (data.length > 2400000) data = out.toDataURL("image/jpeg", 0.76);
      if (data.length <= 2400000)
        results.push({
          id: v.label.toLowerCase().replace(" ", "-") + "-p" + v.page,
          kind: v.kind,
          label: v.label,
          page: v.page,
          caption: v.caption,
          credit: v.label + " · 原论文第 " + v.page + " 页",
          data,
          width: out.width,
          height: out.height,
        });
    }
  } finally {
    canvas.width = canvas.height = out.width = out.height = 0;
  }
  return results;
}

function relevance(v: VisualIndex) {
  if (
    v.kind === "figure" &&
    /architecture|pipeline|framework|construction and validation|method overview|model overview|流程|架构/i.test(
      v.caption,
    )
  )
    return 0;
  if (
    v.kind === "figure" &&
    /effects? of|performance|accuracy|results?|ablation|实验结果|消融/i.test(
      v.cap.text,
    )
  )
    return 1;
  if (
    v.kind === "table" &&
    /results?|performance|accuracy|experiment|benchmark|evaluation|实验|结果/i.test(
      v.caption,
    )
  )
    return 0;
  return v.label === "Figure 1" || v.label === "Table 1" ? 1 : 3;
}
export async function extractPaperVisuals(
  doc: PDFDocumentProxy,
  index: VisualIndex[],
) {
  const selected: VisualIndex[] = [];
  for (const kind of ["figure", "table"] as const) {
    const ranked = index
      .filter((v) => v.kind === kind)
      .sort((a, b) => relevance(a) - relevance(b) || a.page - b.page);
    const first = index.find(
      (v) => v.label === (kind === "figure" ? "Figure 1" : "Table 1"),
    );
    if (first) selected.push(first);
    selected.push(...ranked.filter((v) => v !== first).slice(0, first ? 2 : 3));
  }
  const visuals: PaperVisual[] = [];
  for (const n of new Set(selected.map((v) => v.page))) {
    const page = await doc.getPage(n);
    try {
      visuals.push(
        ...(await extractPage(
          page,
          selected.filter((v) => v.page === n),
          index.filter((v) => v.page === n),
        )),
      );
    } catch {
      /* One malformed graphic cannot invalidate the remaining paper. */
    } finally {
      page.cleanup();
    }
  }
  return visuals;
}
