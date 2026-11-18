import type JSZip from "jszip";
import { loadFonts } from "./render";
import { samplePaperImage } from "./paper-image";
import { campaignLines } from "./campaign-lines";
import { imageCredit, type Paper } from "./paper-model";
import {
  paperStory,
  sampleStoryFact,
  storyIssue,
  storyTexts,
  type StoryCard,
  type StoryRole,
} from "./paper-story-model";

const font = 'PosterCommon, PosterSans, "PingFang SC", sans-serif';
const tones: Record<StoryRole, [string, string, string]> = {
  封面: ["#201e1b", "#fff7e7", "#f99b65"],
  问题: ["#303f39", "#f9f7e8", "#c5dda1"],
  方法: ["#e8ede5", "#202f29", "#49614c"],
  发现: ["#efb27c", "#30221d", "#723e24"],
  解读: ["#e9e5f1", "#30283c", "#695778"],
  边界: ["#e4e8ee", "#243141", "#50677a"],
  摘录: ["#eee9db", "#302c21", "#6c6044"],
};
const english: Record<StoryRole, string> = {
  封面: "PAPER NOTES",
  问题: "QUESTION",
  方法: "METHOD",
  发现: "FINDING",
  解读: "DISCUSSION",
  边界: "LIMITS",
  摘录: "EXCERPT",
};
const number = (i: number) => String(i).padStart(2, "0");

function fitText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  start: number,
  min: number,
  weight = 400,
  leading = 1.3,
) {
  if (!text.trim()) return false;
  let size = start;
  let lines: string[] = [];
  for (;;) {
    g.font = weight + " " + size + "px " + font;
    lines = text
      .trim()
      .split(/\r?\n/)
      .flatMap((line) =>
        campaignLines(
          line,
          width,
          (value) => g.measureText(value).width,
          weight === 700,
        ),
      );
    if (lines.length * size * leading <= height || size === min) break;
    size = Math.max(min, Math.floor(size * 0.91));
  }
  const max = Math.max(1, Math.floor(height / (size * leading)));
  for (const [i, line] of lines.slice(0, max).entries()) {
    let s = line;
    if (i === max - 1 && lines.length > max) {
      while (s && g.measureText(s + "…").width > width) s = s.slice(0, -1);
      s += "…";
    }
    g.fillText(s, x, y + i * size * leading);
  }
  return lines.length > max;
}
export async function drawStoryCard(
  p: Paper,
  card: StoryCard,
  index: number,
  total: number,
  width = 1080,
) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * 4) / 3);
  const g = c.getContext("2d")!;
  g.scale(width / 1080, c.height / 1440);
  g.textBaseline = "top";
  await loadFonts(
    [card.title, card.body, card.quote, p.title, p.byline, "作者原句节选"].join(
      " ",
    ),
  );
  const [bg, ink, muted] = tones[card.role];
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1440);
  const photo = !!p.figure || p.sample;
  const cover = card.role === "封面";
  const label = (
    str: string,
    x: number,
    y: number,
    size: number,
    color = ink,
  ) => {
    g.fillStyle = color;
    g.font = "700 " + size + "px " + font;
    g.fillText(str, x, y);
  };
  const rule = (y: number) => {
    g.fillStyle = muted;
    g.fillRect(64, y, 952, 2);
  };
  if (cover && photo) {
    const img = p.figure ? new Image() : await samplePaperImage();
    if (p.figure) {
      img.src = p.figure.data;
      await img.decode();
    }
    g.fillStyle = p.figure ? "#151613" : "#040403";
    g.fillRect(0, 0, 1080, 727);
    const scale = p.figure
      ? Math.min(950 / img.width, 465 / img.height)
      : Math.max(1080 / img.width, 650 / img.height);
    const w = img.width * scale,
      h = img.height * scale;
    g.save();
    g.beginPath();
    g.rect(0, 150, 1080, 530);
    g.clip();
    g.drawImage(img, (1080 - w) / 2, 405 - h / 2, w, h);
    g.restore();
    g.fillStyle = "#ffffff";
    fitText(g, p.figure?.credit || imageCredit, 64, 666, 952, 56, 19, 16);
  }
  label(
    cover ? "PAPER NOTES" : english[card.role],
    64,
    62,
    30,
    cover ? "#f9c099" : muted,
  );
  g.textAlign = "right";
  label(number(index + 1) + "  /  " + number(total), 1016, 61, 30);
  g.textAlign = "left";
  rule(125);
  let clipped = false;
  if (cover) {
    if (!photo) {
      g.fillStyle = "#f2be87";
      g.fillRect(64, 205, 70, 12);
    }
    const titleY = photo ? 808 : 305;
    g.fillStyle = ink;
    clipped = fitText(
      g,
      card.title,
      64,
      titleY,
      952,
      photo ? 319 : 581,
      photo ? 88 : 101,
      29,
      700,
      1.16,
    );
    g.fillStyle = "#d3c7ba";
    clipped =
      fitText(
        g,
        card.body,
        68,
        photo ? 1138 : 930,
        937,
        photo ? 170 : 315,
        36,
        23,
      ) || clipped;
  } else {
    label("论文图解  /  " + card.role, 64, 177, 31, muted);
    g.fillStyle = ink;
    clipped = fitText(g, card.title, 59, 250, 958, 264, 87, 32, 700, 1.16);
    const fact = sampleStoryFact(p, card.quote);
    const measure = fact?.measure;
    if (measure) {
      label(fact.caption, 66, 529, 29, muted);
      g.fillStyle = ink;
      g.font = 'normal 126px Georgia, "Times New Roman", serif';
      g.fillText(measure, 58, 563);
    }
    const top = measure ? 767 : 532;
    const showQuote = card.body.trim() !== card.quote.trim();
    g.fillStyle = ink;
    clipped =
      fitText(
        g,
        card.body,
        64,
        top,
        950,
        (showQuote ? 1002 : 1284) - top,
        56,
        27,
      ) || clipped;
    if (showQuote) {
      rule(1020);
      const quoteLabel = "论文原句";
      label(quoteLabel, 65, 1048, 24, muted);
      g.fillStyle = muted;
      const excerpt = fitText(g, card.quote, 65, 1103, 951, 192, 34, 26);
      if (excerpt) label("节选", 190, 1048, 24, muted);
    }
  }
  rule(1320);
  g.fillStyle = cover ? "#d3c7ba" : muted;
  const footer = clipped
    ? "卡片文字节选 · 完整文字见配文"
    : p.byline || p.title;
  fitText(g, footer, 65, 1350, 951, 72, 24, 19);
  return c;
}
export async function addStoryToZip(zip: JSZip, p: Paper) {
  const issue = storyIssue(p);
  if (issue) throw Error(issue);
  const cards = paperStory(p);
  for (const [index, card] of cards.entries()) {
    const canvas = await drawStoryCard(p, card, index, cards.length);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(Error("图解卡片导出失败，请重试。")),
        "image/png",
      ),
    );
    zip.file(number(index + 1) + "-" + card.role + ".png", png);
  }
  const { caption, sources } = storyTexts(p, cards);
  const credit = p.figure
    ? p.figure.credit
    : p.sample
      ? imageCredit +
        "\nhttps://www.eso.org/public/images/eso1907a/\nhttps://creativecommons.org/licenses/by/4.0/"
      : "";
  zip.file("发布文案.txt", caption);
  zip.file("逐卡引文.txt", sources + (credit ? "\n\n封面插图\n" + credit : ""));
}
export async function storyPack(p: Paper) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  await addStoryToZip(zip, p);
  return zip.generateAsync({ type: "blob" });
}
