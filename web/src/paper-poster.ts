import { campaignLines } from "./campaign-lines";
import { platforms, type Channel, type Paper } from "./paper-model";

import { PaperCanvas, type PaperRect as Rect } from "./paper-canvas";
const type = 'PosterCommon, PosterSans, "PingFang SC", sans-serif';
const paperWhite = "#f9f8f4";
const ink = "#182528";

function textBlock(
  canvas: PaperCanvas,
  name: string,
  text: string,
  box: Rect,
  size: number,
  color: string,
  weight = 400,
  floor = size,
  leading = 1.18,
  alignBottom = false,
) {
  const { g } = canvas;
  const family = /[\u2e80-\u9fff]/u.test(text)
    ? type
    : "Arial, Helvetica, sans-serif";
  let lines: string[];
  do {
    g.font = `${weight} ${size}px ${family}`;
    lines = campaignLines(
      text.replace(/\s+/g, " ").trim(),
      box.w,
      (v) => g.measureText(v).width,
      weight >= 700,
    );
    if (size <= floor || lines.length * size * leading <= box.h) break;
    size = Math.max(floor, size * 0.93);
  } while (true);
  const max = Math.max(1, Math.floor(box.h / (size * leading)));
  if (lines.length > max) {
    lines = lines.slice(0, max);
    let tail = Array.from(lines[max - 1]);
    while (tail.length && g.measureText(tail.join("") + "…").width > box.w)
      tail.pop();
    lines[max - 1] = tail.join("").trimEnd() + "…";
  }
  g.fillStyle = color;
  g.textBaseline = "top";
  const y = box.y + (alignBottom ? box.h - lines.length * size * leading : 0);
  canvas.text(name, lines, box.x, y, box.w, size * leading);
}

function label(
  canvas: PaperCanvas,
  name: string,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const { g } = canvas;
  g.fillStyle = color;
  g.font = `700 ${size}px ${type}`;
  g.textBaseline = "top";
  canvas.text(
    name,
    [text],
    x,
    y,
    Math.ceil(g.measureText(text).width) + 2,
    size * 1.2,
  );
}

async function decode(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function cover(g: CanvasRenderingContext2D, image: HTMLImageElement, r: Rect) {
  const scale = Math.max(r.w / image.naturalWidth, r.h / image.naturalHeight);
  const sw = r.w / scale,
    sh = r.h / scale;
  const sx = (image.naturalWidth - sw) * 0.6,
    sy = (image.naturalHeight - sh) * 0.23;
  g.drawImage(image, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
}

function figurePanel(
  canvas: PaperCanvas,
  source: string,
  figure: HTMLImageElement,
  credit: string,
  box: Rect,
  short: number,
  english: boolean,
) {
  const { g } = canvas;
  canvas.layer = "论文原图";
  const m = short * 0.036,
    labelSize = short * 0.02;
  canvas.rect("图版衬底", box, paperWhite);
  const fx = box.x + m,
    fy = box.y + m * 0.72,
    fw = box.w - 2 * m;
  const marker = /^(?:fig(?:ure)?\.?\s*1\b|图\s*1\b)/i.test(credit)
    ? "FIG. 01"
    : "SOURCE FIGURE";
  label(canvas, "图号", marker, fx, fy, labelSize, ink);
  const sourceCredit = english
    ? credit.replace(/原论文第\s*(\d+)\s*页/g, "p. $1")
    : credit;
  const detail = sourceCredit.replace(/^Figure\s*1\s*[·•|—-]?\s*/i, "").trim();
  g.textAlign = "right";
  textBlock(
    canvas,
    "原图署名",
    detail,
    { x: fx + fw, y: fy, w: fw * 0.64, h: labelSize * 1.3 },
    labelSize * 0.89,
    "#435354",
    400,
  );
  g.textAlign = "left";
  const edge = fy + labelSize * 1.7;
  canvas.rect("图注分隔线", { x: fx, y: edge, w: fw, h: 1.5 }, "#c6cfca");
  const imageBox = {
    x: fx,
    y: edge + m * 0.34,
    w: fw,
    h: box.y + box.h - m * 0.55 - edge - m * 0.34,
  };
  canvas.rect("原图底色", imageBox, "#ffffff");
  const scale = Math.min(
    imageBox.w / figure.naturalWidth,
    imageBox.h / figure.naturalHeight,
  );
  const w = figure.naturalWidth * scale,
    h = figure.naturalHeight * scale;
  canvas.image("论文原图 · " + credit, figure, source, {
    x: imageBox.x + (imageBox.w - w) / 2,
    y: imageBox.y + (imageBox.h - h) / 2,
    w,
    h,
  });
}

export async function composePaperPoster(
  canvas: PaperCanvas,
  paper: Paper,
  channel: Channel,
) {
  const { width: w, height: h } = platforms[channel];
  const [art, figure] = await Promise.all([
    paper.artwork ? decode(paper.artwork.data) : undefined,
    paper.figure ? decode(paper.figure.data) : undefined,
  ]);
  const wide = w / h > 1.4,
    short = Math.min(w, h),
    footerH = short * 0.085;
  const bodyH = h - footerH,
    m = short * 0.049;
  const figureRatio = figure ? figure.naturalWidth / figure.naturalHeight : 1;
  // A wide multi-panel chart needs the full page width even on a landscape cover.
  // A tall architecture diagram needs extra height on portrait layouts.
  const sideFigure = !!figure && wide && figureRatio < 2.4;
  const panelShare = wide
    ? 0.48
    : Math.min(
        figureRatio < 1 ? 0.58 : 0.48,
        Math.max(
          0.29,
          ((w - short * 0.072) / figureRatio + short * 0.1) / bodyH,
        ),
      );
  const sideWidth =
    figureRatio < 1
      ? Math.max(0.3, Math.min(0.51, (bodyH * figureRatio + m) / w))
      : 0.51;
  const hero: Rect = {
    x: 0,
    y: 0,
    w: sideFigure ? w * (1 - sideWidth) : w,
    h: figure && !sideFigure ? bodyH * (1 - panelShare) : bodyH,
  };
  const english = channel === "x";
  const title = english ? paper.coverTitleEn || paper.title : paper.headline;
  const deck = english ? paper.coverLineEn : paper.coverLine;
  const edition = art
    ? english
      ? "RESEARCH CONCEPT"
      : "研究概念图"
    : english
      ? "RESEARCH SPOTLIGHT"
      : "论文导读";
  // Keep the artwork and the source figure in separate rectangles: landscape
  // diagrams keep their original aspect ratio, labels, tick marks and colors.
  if (!art)
    canvas.artwork("背景渐变", hero, (g) => {
      const wash = g.createLinearGradient(0, 0, hero.w, hero.h);
      wash.addColorStop(0, "#284848");
      wash.addColorStop(0.43, "#1d3235");
      wash.addColorStop(1, "#091516");
      g.fillStyle = wash;
      g.fillRect(0, 0, hero.w, hero.h);
    });
  if (art)
    canvas.artwork("AI 主视觉 · " + paper.artwork!.model, hero, (g) =>
      cover(g, art, hero),
    );
  canvas.artwork("主视觉文字渐暗遮罩", hero, (g) => {
    const shade = g.createLinearGradient(0, 0, 0, hero.h);
    shade.addColorStop(0, art ? "rgba(4,12,15,.32)" : "rgba(4,12,15,0)");
    shade.addColorStop(0.3, "rgba(4,12,15,.06)");
    shade.addColorStop(0.66, "rgba(4,12,15,.63)");
    shade.addColorStop(1, "rgba(4,12,15,.96)");
    g.fillStyle = shade;
    g.fillRect(0, 0, hero.w, hero.h);
  });
  const accent = "#c5f58b";
  canvas.layer = "标题与文案";
  canvas.rect(
    "栏目色条",
    { x: m, y: m * 0.93, w: Math.max(3, short * 0.004), h: short * 0.024 },
    accent,
  );
  label(
    canvas,
    "栏目",
    edition,
    m + short * 0.014,
    m * 0.87,
    short * 0.024,
    "#f3fae9",
  );
  const textW =
    !figure && wide ? Math.min(w - m * 2, w * 0.73) : hero.w - 2 * m;
  const deckH = deck ? Math.min(short * 0.101, hero.h * 0.17) : 0;
  const headlineBox: Rect = {
    x: m,
    y: hero.h * 0.21,
    w: textW,
    h: hero.h * 0.79 - m - deckH - (deck ? short * 0.018 : 0),
  };
  textBlock(
    canvas,
    "海报标题",
    title,
    headlineBox,
    short * (english ? 0.079 : 0.091),
    "#ffffff",
    700,
    short * 0.027,
    1.15,
    true,
  );
  if (deck)
    textBlock(
      canvas,
      "宣传导语",
      deck,
      { x: m, y: hero.h - m - deckH, w: textW, h: deckH },
      short * 0.028,
      "#e6eee7",
      400,
      short * 0.02,
      1.32,
      true,
    );

  if (figure && paper.figure) {
    const panel = sideFigure
      ? { x: hero.w, y: 0, w: w - hero.w, h: bodyH }
      : { x: 0, y: hero.h, w, h: bodyH - hero.h };
    figurePanel(
      canvas,
      paper.figure.data,
      figure,
      paper.figure.credit,
      panel,
      short,
      english,
    );
  }
  canvas.layer = "出处";
  canvas.rect("出处底栏", { x: 0, y: bodyH, w, h: footerH }, ink);
  canvas.rect(
    "出处色条",
    { x: m, y: bodyH + footerH * 0.43, w: short * 0.021, h: short * 0.005 },
    accent,
  );
  const citation = paper.byline || paper.title;
  const citationBox = {
    x: m + short * 0.036,
    y: bodyH + footerH * 0.16,
    w: w - 2 * m - short * 0.036,
    h: footerH * 0.7,
  };
  textBlock(
    canvas,
    "论文出处",
    citation,
    citationBox,
    short * 0.0195,
    "#e8ede7",
    400,
    short * 0.013,
    1.18,
    true,
  );
}
