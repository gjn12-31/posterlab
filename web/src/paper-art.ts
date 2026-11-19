import { campaignLines as wrapLines } from "./campaign-lines";
import { samplePaperImage } from "./paper-image";
import { composePaperPoster } from "./paper-poster";
import { PaperCanvas } from "./paper-canvas";
import type { DrawioPage } from "./drawio";
import { articleFragment, noteParts, postParts } from "./paper-publication";
import { loadFonts } from "./render";
import { creditText } from "./background-library";
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
  scene: PaperCanvas,
  p: Paper,
  c: Channel,
  w: number,
  h: number,
) {
  const { g } = scene;
  const wide = w / h > 1.4,
    pad = w * 0.065,
    short = Math.min(w, h);
  const palette = {
    red: ["#e9ded1", "#ab412c"],
    moments: ["#e8e9dc", "#5a6543"],
    x: ["#e5e7ec", "#445e9b"],
    wechat: ["#eddfcc", "#8b582e"],
  }[c];
  scene.rect("底色", { x: 0, y: 0, w, h }, palette[0]);
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
    scene.rect(
      "叠页 " + (i + 1),
      { x: i * sw * 0.14, y: i * sw * 0.12, w: sw, h: sh },
      i === 0 ? palette[1] : palette[0],
      palette[1],
      2,
    );
  }
  g.fillStyle = "#fff9eb";
  g.textAlign = "left";
  g.font = "bold " + sw * 0.12 + "px Arial";
  scene.text(
    "论文简称",
    [method || "Paper"],
    sw * 0.1,
    sh * 0.82,
    sw * 0.82,
    sw * 0.15,
    true,
  );
  g.restore();
  g.fillStyle = palette[1];
  g.font = "bold " + short * 0.029 + "px " + paperFont;
  scene.layer = "标题与文案";
  scene.text(
    "栏目",
    [platforms[c].name + "  /  " + platforms[c].type],
    pad,
    h * 0.105,
    w * 0.6,
    short * 0.036,
  );
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
  scene.text("海报标题", lines, pad, top, textWidth, size * 1.16);
  const x = pad,
    y = h * (wide ? 0.72 : 0.73);
  scene.rect(
    "引文色条",
    { x, y, w: short * 0.05, h: Math.max(3, short * 0.004) },
    palette[1],
  );
  g.font = "600 " + short * 0.021 + "px " + paperFont;
  scene.text(
    "引文标题",
    ["论文原句"],
    x,
    y + short * 0.015,
    w * 0.34,
    short * 0.027,
  );
  const quote = p.evidence[0].quote;
  const qs = short * 0.027;
  g.font = "400 " + qs + "px " + paperFont;
  const q = rows(g, quote, wide ? w * 0.83 : w * 0.84);
  const count = 2;
  g.fillStyle = "#3d3934";
  const quoteLines = q
    .slice(0, count)
    .map((line, i) => line + (i === count - 1 && q.length > count ? "…" : ""));
  scene.text(
    "原文引句",
    quoteLines,
    x,
    y + short * 0.048,
    wide ? w * 0.85 : w * 0.86,
    qs * 1.27,
    true,
  );
  scene.layer = "出处";
  scene.rect(
    "出处分隔线",
    { x: pad, y: h * 0.923, w: w - 2 * pad, h: 1 },
    "#8f877d",
  );
  g.font = "500 " + short * 0.021 + "px " + paperFont;
  g.fillStyle = "#3b3934";
  scene.text(
    "论文出处",
    [p.byline || p.title],
    pad,
    h * 0.944,
    w - 2 * pad,
    short * 0.027,
    true,
  );
}

async function paintPaper(p: Paper, c: Channel, editable = false) {
  const { width: w, height: h } = platforms[c];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const scene = new PaperCanvas(canvas.getContext("2d")!, editable);
  const { g } = scene;
  const title = c === "x" ? p.title : p.headline;
  await loadFonts(title + "科研笔记论文导读研究分享");
  if (p.artwork || p.figure) {
    await loadFonts(
      [title, p.coverLine, p.coverLineEn, p.coverTitleEn, p.byline]
        .filter(Boolean)
        .join(" "),
    );
    await composePaperPoster(scene, p, c);
    return scene;
  }
  if (!p.sample) {
    editorialCover(scene, p, c, w, h);
    return scene;
  }
  const wide = w / h > 1.4,
    pad = w * 0.062,
    dark = "#120e10",
    accent = "#ffa16d";
  scene.rect("底色", { x: 0, y: 0, w, h }, dark);
  const img = await samplePaperImage();
  const size = wide ? h * 1.27 : w * 0.84,
    cx = wide ? w * 0.77 : w * 0.5,
    cy = wide ? h * 0.5 : h * 0.32;
  const photo = {
    x: cx - size * 0.85,
    y: cy - size * 0.5,
    w: size * 1.7,
    h: size,
  };
  const x0 = Math.max(0, photo.x),
    y0 = Math.max(0, photo.y);
  const visible = {
    x: x0,
    y: y0,
    w: Math.min(w, photo.x + photo.w) - x0,
    h: Math.min(h, photo.y + photo.h) - y0,
  };
  scene.artwork("M87 · " + imageCredit, visible, (ctx) => {
    ctx.save();
    ctx.fillStyle = dark;
    ctx.fillRect(visible.x, visible.y, visible.w, visible.h);
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(img, photo.x, photo.y, photo.w, photo.h);
    ctx.restore();
  });
  scene.layer = "标题与文案";
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.029) + "px Arial";
  const tag = {
    red: "RESEARCH NOTES",
    x: "RESEARCH THREAD",
    moments: "PAPER SPOTLIGHT",
    wechat: "RESEARCH BRIEF",
  }[c];
  scene.text(
    "栏目",
    [tag],
    pad,
    wide ? h * 0.125 : h * 0.083,
    w * 0.6,
    Math.min(w, h) * 0.036,
  );
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
  scene.text("海报标题", lines, pad, top, areaW, font * 1.15);
  if (fits) {
    g.font = "400 " + captionSize + "px " + paperFont;
    g.fillStyle = "#e7dcd3";
    scene.text(
      "宣传导语",
      caption,
      pad,
      bottom + h * 0.026,
      areaW,
      captionSize * 1.36,
    );
  }
  scene.layer = "出处";
  g.textBaseline = "alphabetic";
  scene.rect(
    "出处分隔线",
    { x: pad, y: h * 0.885 - 0.5, w: w - 2 * pad, h: 1 },
    "#60575c",
  );
  g.fillStyle = accent;
  g.font = "bold " + Math.round(Math.min(w, h) * 0.023) + "px Arial";
  scene.text(
    "论文出处",
    ["M87*   /   EHT 2019"],
    pad,
    h * 0.94,
    w * 0.38,
    Math.min(w, h) * 0.028,
  );
  g.textAlign = "right";
  g.fillStyle = "#e4d9d6";
  g.font = Math.round(Math.min(w, h) * 0.018) + "px Arial";
  scene.text(
    "图像署名",
    [imageCredit],
    w - pad,
    h * 0.94,
    w * 0.54,
    Math.min(w, h) * 0.023,
    true,
  );
  return scene;
}
async function customPaperPage(p: Paper, c: Channel) {
  const layout=p.posterLayouts?.[c];
  if(!layout)return;
  const {paperLayoutPage}=await import("./paper-layout");
  await loadFonts(layout.objects.map(o=>o.type==="text"?o.text:"").join(" "));
  return paperLayoutPage(p,c,layout,document.createElement("canvas").getContext("2d")!);
}
export async function drawPaper(p: Paper, c: Channel) {
  const custom=await customPaperPage(p,c);
  if(custom)return (await import("./paper-layout")).renderPaperLayout(custom);
  return (await paintPaper(p, c)).g.canvas;
}
export async function paperDrawioPage(
  p: Paper,
  c: Channel,
): Promise<DrawioPage> {
  const custom=await customPaperPage(p,c);
  if(custom)return custom;
  const scene = await paintPaper(p, c, true);
  return {
    name: platforms[c].name + " · " + p.headline,
    width: scene.g.canvas.width,
    height: scene.g.canvas.height,
    elements: scene.elements,
  };
}
export async function paperDrawio(p: Paper, c: Channel) {
  const { drawioBlob } = await import("./drawio");
  return drawioBlob(await paperDrawioPage(p, c));
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
    const library = p.posterLayouts?.[c]?.libraryBackground?.credit;
    if (library) folder.file("背景图来源.txt", creditText(library));
    folder.file("配图.png", await paperPng(p, c));
    if (p.posterLayouts?.[c])
      folder.file("可编辑海报.drawio", await (await paperDrawio(p, c)).text());
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
  const usedImages = new Set((selected ? [selected] : channels).flatMap(
    c => (p.posterLayouts?.[c]?.objects || []).flatMap(o => o.type === "image" ? [o.source] : []),
  ));
  const usedVisuals = (p.visuals || []).filter(v => usedImages.has(v.id));
  for (const visual of usedVisuals) {
    const safe = visual.id.replace(/[^a-z0-9_-]/gi, "_");
    zip.file("论文原图/" + safe + ".jpg", visual.data.slice(visual.data.indexOf(",") + 1), { base64: true });
  }
  if (p.figure || p.artwork || usedVisuals.length) {
    zip.file(
      "配图来源.txt",
      [
        p.title,
        p.byline,
        p.source,
        p.figure ? "论文原图：" + p.figure.credit : "",
        ...usedVisuals.map(v => v.credit + "\n" + v.caption),
        p.artwork ? "概念主视觉：AI 生成 · " + p.artwork.model : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (p.imageLicense) zip.file("图像授权与署名.txt", p.imageLicense);
  return zip.generateAsync({ type: "blob" });
}
