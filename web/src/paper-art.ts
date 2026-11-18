import { campaignLines as wrapLines } from "./campaign-lines";
import { samplePaperImage } from "./paper-image";
import { composePaperPoster } from "./paper-poster";
import { articleFragment, noteParts, postParts } from "./paper-publication";
import { loadFonts } from "./render";
import {
  channels,
  channelCopy,
  evidenceText,
  imageCredit,
  platforms,
  type Channel,
  type Paper,
} from "./paper-model";
const paperFont = 'PosterCommon, PosterSans, "PingFang SC", sans-serif';
function rows(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  headline = false,
) {
  return text
    .split(/\r?\n/)
    .flatMap((paragraph) =>
      wrapLines(
        paragraph,
        width,
        (line) => ctx.measureText(line).width,
        headline,
      ),
    );
}
function editorialCover(
  g: CanvasRenderingContext2D,
  p: Paper,
  c: Channel,
  w: number,
  h: number,
) {
  const wide = w / h > 1.4,
    pad = w * 0.065,
    short = Math.min(w, h);
  const palette = {
    red: ["#e9ded1", "#ab412c"],
    moments: ["#e8e9dc", "#5a6543"],
    x: ["#e5e7ec", "#445e9b"],
    wechat: ["#eddfcc", "#8b582e"],
  }[c];
  g.fillStyle = palette[0];
  g.fillRect(0, 0, w, h);
  const method = p.title.match(/^([A-Za-z][A-Za-z0-9 -]{1,22})[:：]/)?.[1];
  // On stacked layouts the complete, rotated deck must end above the title.
  // Limit its size by height as well as width for square and portrait exports.
  const sw = wide ? short * 0.27 : Math.min(w * 0.19, h * 0.14),
    sh = sw * 1.34;
  const visualX = wide ? w * 0.72 : w - pad - sw * 1.65,
    visualY = wide ? h * 0.27 : h * 0.075;
  g.save();
  g.translate(visualX, visualY);
  g.rotate(-0.12);
  for (let i = 3; i >= 0; i--) {
    g.fillStyle = i === 0 ? palette[1] : palette[0];
    g.strokeStyle = palette[1];
    g.lineWidth = 2;
    g.fillRect(i * sw * 0.14, i * sw * 0.12, sw, sh);
    g.strokeRect(i * sw * 0.14, i * sw * 0.12, sw, sh);
  }
  g.fillStyle = "#fff9eb";
  g.textAlign = "left";
  g.font = "bold " + sw * 0.12 + "px Arial";
  g.fillText(method || "Paper", sw * 0.1, sh * 0.82, sw * 0.82);
  g.restore();
  g.fillStyle = palette[1];
  g.font = "bold " + short * 0.029 + "px " + paperFont;
  g.fillText(platforms[c].name + "  /  " + platforms[c].type, pad, h * 0.105);
  const title = c === "x" ? p.title : p.headline;
  let size = short * (wide ? 0.113 : 0.092),
    top = h * (wide ? 0.235 : 0.355);
  const textWidth = wide ? w * 0.55 : w - 2 * pad;
  let lines: string[] = [];
  do {
    g.font = "700 " + size + "px " + paperFont;
    lines = rows(g, title, textWidth, true);
    if (lines.length * size * 1.16 <= h * (wide ? 0.43 : 0.31) || size <= 16)
      break;
    size *= 0.94;
  } while (true);
  g.fillStyle = "#22211d";
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, pad, top + i * size * 1.16));
  const x = pad,
    y = h * (wide ? 0.72 : 0.73);
  g.fillStyle = palette[1];
  g.fillRect(x, y, short * 0.05, Math.max(3, short * 0.004));
  g.font = "600 " + short * 0.021 + "px " + paperFont;
  g.fillText("论文原句", x, y + short * 0.015);
  const quote = p.evidence[0].quote;
  const qs = short * 0.027;
  g.font = "400 " + qs + "px " + paperFont;
  const q = rows(g, quote, wide ? w * 0.83 : w * 0.84);
  const count = 2;
  g.fillStyle = "#3d3934";
  q.slice(0, count).forEach((line, i) =>
    g.fillText(
      line + (i === count - 1 && q.length > count ? "…" : ""),
      x,
      y + short * 0.048 + i * qs * 1.27,
      wide ? w * 0.85 : w * 0.86,
    ),
  );
  g.fillStyle = "#8f877d";
  g.fillRect(pad, h * 0.923, w - 2 * pad, 1);
  g.font = "500 " + short * 0.021 + "px " + paperFont;
  g.fillStyle = "#3b3934";
  g.fillText(p.byline || p.title, pad, h * 0.944, w - 2 * pad);
}

export async function drawPaper(p: Paper, c: Channel) {
  const { width: w, height: h } = platforms[c];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const title = c === "x" ? p.title : p.headline;
  await loadFonts(title + "科研笔记论文导读研究分享");
  if (p.artwork || p.figure) {
    await loadFonts(
      [title, p.coverLine, p.coverLineEn, p.coverTitleEn, p.byline]
        .filter(Boolean)
        .join(" "),
    );
    await composePaperPoster(g, p, c);
    return canvas;
  }
  if (!p.sample) {
    editorialCover(g, p, c, w, h);
    return canvas;
  }
  const wide = w / h > 1.4,
    pad = w * 0.062,
    warm = p.sample && !p.figure,
    dark = warm ? "#120e10" : "#191c32",
    accent = warm ? "#ffa16d" : "#cdc6ff";
  g.fillStyle = dark;
  g.fillRect(0, 0, w, h);
  if (warm) {
    const img = await samplePaperImage();
    const size = wide ? h * 1.27 : w * 0.84,
      cx = wide ? w * 0.77 : w * 0.5,
      cy = wide ? h * 0.5 : h * 0.32;
    g.save();
    g.beginPath();
    g.rect(0, 0, w, h);
    g.clip();
    g.globalCompositeOperation = "screen";
    g.drawImage(img, cx - size * 0.85, cy - size * 0.5, size * 1.7, size);
    g.restore();
  } else {
    g.save();
    g.fillStyle = "#343252";
    g.translate(wide ? w * 0.82 : w * 0.76, wide ? h * 0.5 : h * 0.2);
    g.rotate(-0.24);
    for (const shift of [-1, 1]) {
      const q = wide ? h * 0.27 : w * 0.22;
      g.fillRect(shift * q * 0.52 - q * 0.45, -q * 0.82, q * 0.88, q * 1.24);
      g.beginPath();
      g.moveTo(shift * q * 0.52 - q * 0.45, q * 0.38);
      g.lineTo(shift * q * 0.52 + q * 0.43, q * 0.38);
      g.lineTo(shift * q * 0.52 - q * 0.45, q * 0.97);
      g.fill();
    }
    g.restore();
  }
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.029) + "px Arial";
  const tag = {
    red: "RESEARCH NOTES",
    x: "RESEARCH THREAD",
    moments: "PAPER SPOTLIGHT",
    wechat: "RESEARCH BRIEF",
  }[c];
  g.fillText(tag, pad, wide ? h * 0.125 : h * 0.083);
  const areaW = wide ? w * 0.53 : w * 0.87,
    top = wide ? h * 0.23 : h * 0.505;
  const take =
    c === "x"
      ? p.evidence[p.evidence.length - 1].quote
      : p.evidence[Math.min(1, p.evidence.length - 1)].line;
  const captionSize = Math.min(w, h) * (wide ? 0.034 : 0.033);
  g.font = "400 " + captionSize + "px " + paperFont;
  const caption = rows(g, take, areaW);
  const fits = caption.length <= (wide ? 3 : 4);
  const bottom = fits ? (wide ? h * 0.57 : h * 0.665) : h * 0.84;
  let font = Math.min(w, h) * (wide ? 0.108 : 0.084),
    lines: string[] = [];
  while (true) {
    g.font = "700 " + font + "px " + paperFont;
    lines = rows(g, title, areaW, true);
    if (lines.length * font * 1.15 <= bottom - top || font <= 12) break;
    font *= 0.94;
  }
  g.fillStyle = "#fffaf5";
  g.textBaseline = "top";
  lines.forEach((s, i) => g.fillText(s, pad, top + i * font * 1.15));
  if (fits) {
    g.font = "400 " + captionSize + "px " + paperFont;
    g.fillStyle = "#e7dcd3";
    caption.forEach((s, i) =>
      g.fillText(s, pad, bottom + h * 0.026 + i * captionSize * 1.36),
    );
  }
  g.textBaseline = "alphabetic";
  g.strokeStyle = "#60575c";
  g.beginPath();
  g.moveTo(pad, h * 0.885);
  g.lineTo(w - pad, h * 0.885);
  g.stroke();
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.023) + "px Arial";
  g.fillText(
    warm ? "M87*   /   EHT 2019" : "PAPER  /  RESEARCH NOTES",
    pad,
    h * 0.94,
  );
  g.textAlign = "right";
  g.fillStyle = "#e4d9d6";
  g.font = Math.round(Math.min(w, h) * 0.018) + "px Arial";
  g.fillText(warm ? imageCredit : "PosterLab", w - pad, h * 0.94, w * 0.54);
  return canvas;
}
export async function paperPng(p: Paper, c: Channel) {
  const canvas = await drawPaper(p, c);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(Error("配图导出失败"))),
      "image/png",
    ),
  );
}
export async function paperPack(p: Paper, selected?: Channel) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const c of selected ? [selected] : channels) {
    const folder = zip.folder(platforms[c].name)!;
    const copy = channelCopy(p, c);
    folder.file("配图.png", await paperPng(p, c));
    folder.file("发布文案.txt", copy);
    if (c === "x") {
      postParts(copy).forEach((text, i) =>
        folder.file(`短帖/${String(i + 1).padStart(2, "0")}.txt`, text),
      );
    } else if (c === "red") {
      const { title, body } = noteParts(copy);
      if (title) {
        folder.file("标题.txt", title);
        folder.file("正文.txt", body);
      }
    } else if (c === "wechat") {
      folder.file(
        "排版稿.html",
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>公众号排版稿</title><body>' +
          articleFragment(copy) +
          "</body></html>",
      );
    }
  }
  zip.file("原文与引文.txt", evidenceText(p));
  if (p.figure || p.artwork) {
    zip.file(
      "配图来源.txt",
      [
        p.title,
        p.byline,
        p.source,
        p.figure ? "论文原图：" + p.figure.credit : "",
        p.artwork ? "概念主视觉：AI 生成 · " + p.artwork.model : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return zip.generateAsync({ type: "blob" });
}
