import { englishPaperLayout } from "./paper-layout-english";
import { campaignLines } from "./campaign-lines";
import { platforms, type Channel, type Paper } from "./paper-model";
import type { PosterLayout, PosterObject } from "./paper-layout-model";
import type { DrawioElement, DrawioPage } from "./drawio";

export type PaperLayoutPlan = {
  title: string;
  subtitle: string;
  composition: "method-first" | "results-first" | "balanced";
  accent: "cobalt" | "teal" | "plum";
  blocks: {
    role: "problem" | "method" | "result";
    heading: string;
    text: string;
  }[];
  caption: string;
};
const palette = { cobalt: "#244bbd", teal: "#086862", plum: "#754270" };
const font = 'PosterCommon, PosterSans, "PingFang SC", Arial, sans-serif';
const sourceFont =
  "Noto Sans CJK SC, PingFang SC, Microsoft YaHei, Arial, sans-serif";

export function layoutSources(paper: Paper) {
  const sources = (paper.visuals || []).map((v) => ({
    id: v.id,
    data: v.data,
    name: v.credit,
    width: v.width,
    height: v.height,
  }));
  if (paper.figure && !sources.some((v) => v.data === paper.figure!.data))
    sources.push({
      id: "original",
      name: paper.figure.credit,
      data: paper.figure.data,
      width: paper.figure.width || 0,
      height: paper.figure.height || 0,
    });
  if (paper.artwork) {
    const data = paper.artwork.data;
    let width = 0,
      height = 0;
    // The gateway embeds a WebP. Its small fixed header contains the canvas
    // dimensions even when the image is many megabytes.
    const h = atob(data.slice(data.indexOf(",") + 1, data.indexOf(",") + 65));
    const n = (i: number) => h.charCodeAt(i) || 0;
    if (h.slice(12, 16) === "VP8X") {
      width = 1 + n(24) + (n(25) << 8) + (n(26) << 16);
      height = 1 + n(27) + (n(28) << 8) + (n(29) << 16);
    } else if (h.slice(12, 16) === "VP8 ") {
      width = (n(26) + (n(27) << 8)) & 16383;
      height = (n(28) + (n(29) << 8)) & 16383;
    } else if (h.slice(12, 16) === "VP8L") {
      width = 1 + n(21) + ((n(22) & 63) << 8);
      height = 1 + (n(22) >> 6) + (n(23) << 2) + ((n(24) & 15) << 10);
    }
    sources.push({
      id: "artwork",
      name: "AI 概念配图 · " + paper.artwork.model,
      data,
      width,
      height,
    });
  }
  return sources;
}

export function imageObject(
  source: ReturnType<typeof layoutSources>[number],
  channel: Channel,
  box: Pick<PosterObject, "x" | "y" | "w" | "h">,
  id = crypto.randomUUID() as string,
): PosterObject {
  const { width, height } = platforms[channel];
  let { x, y, w, h } = box;
  if (source.width && source.height) {
    const scale = Math.min(
      (w * width) / source.width,
      (h * height) / source.height,
    );
    const iw = (source.width * scale) / width,
      ih = (source.height * scale) / height;
    x += (w - iw) / 2;
    y += (h - ih) / 2;
    w = iw;
    h = ih;
  }
  return {
    id,
    type: "image",
    name: source.name,
    source: source.id,
    x,
    y,
    w,
    h,
  };
}

export function makePaperLayout(
  p: Paper,
  c: Channel,
  plan?: PaperLayoutPlan,
  methodFigureId?: string | null,
  resultTableId?: string | null,
): PosterLayout {
  const dims = platforms[c],
    short = Math.min(dims.width, dims.height),
    wide = dims.width / dims.height > 1.4;
  const accent = palette[plan?.accent || "cobalt"];
  const objects: PosterObject[] = [];
  function text(
    id: string,
    name: string,
    content: string | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    bold = false,
    color = "#202e36",
  ) {
    if (content?.trim())
      objects.push({
        id,
        type: "text",
        name,
        text: content.trim().slice(0, 3200),
        x,
        y,
        w,
        h,
        size: Math.max(7, Math.min(250, size * short)),
        bold,
        color,
      });
  }
  const source = layoutSources(p);
  const visuals = p.visuals || [];
  const method =
    methodFigureId === undefined
      ? visuals.find(
          (v) =>
            v.kind === "figure" &&
            /pipeline|architecture|construction|framework|架构|流程/i.test(
              v.caption,
            ),
        )?.id ||
        visuals.find((v) => v.kind === "figure")?.id ||
        (p.figure ? "original" : undefined)
      : methodFigureId;
  const result =
    resultTableId === undefined
      ? visuals.find((v) => v.kind === "table")?.id
      : resultTableId;
  const blocks = plan?.blocks || [];
  const problem = blocks.find((b) => b.role === "problem");
  const concept = source.find((v) => v.id === "artwork");
  if (concept) {
    objects.push(
      imageObject(
        concept,
        c,
        { x: 0.721, y: 0.014, w: 0.248, h: wide ? 0.184 : 0.142 },
        "concept-image",
      ),
    );
    text(
      "concept-credit",
      "概念配图署名",
      "AI 概念配图",
      0.721,
      wide ? 0.202 : 0.159,
      0.24,
      0.02,
      0.013,
      false,
      "#c4d1d5",
    );
  }
  const titleW = concept ? 0.64 : 0.896;
  text(
    "title",
    "海报标题",
    plan?.title || (c === "x" ? p.coverTitleEn : p.headline) || p.title,
    0.052,
    0.032,
    titleW,
    wide ? 0.112 : 0.079,
    wide ? 0.064 : 0.058,
    true,
    "#fcfcf6",
  );
  text(
    "subtitle",
    "宣传导语",
    plan?.subtitle || (c === "x" ? p.coverLineEn : p.coverLine),
    0.054,
    wide ? 0.153 : 0.118,
    titleW,
    wide ? 0.062 : 0.052,
    wide ? 0.028 : 0.024,
    false,
    "#c1d3da",
  );
  let y = wide ? 0.245 : 0.201;
  if (problem) {
    text(
      "problem-label",
      "问题标题",
      problem.heading,
      0.054,
      y,
      0.17,
      0.045,
      0.022,
      true,
      accent,
    );
    text(
      "problem",
      "研究问题",
      problem.text,
      0.23,
      y,
      0.715,
      wide ? 0.095 : 0.054,
      wide ? 0.024 : 0.023,
    );
    y += wide ? 0.128 : 0.077;
  }
  const roles: ("method" | "result")[] =
    plan?.composition === "results-first"
      ? ["result", "method"]
      : ["method", "result"];
  const areas = roles
    .map((role) => ({
      role,
      block: blocks.find((b) => b.role === role),
      asset: source.find((v) => v.id === (role === "method" ? method : result)),
    }))
    .filter((a) => a.block || a.asset);
  if (!areas.length) {
    const main = source.find((s) => s.id !== "artwork");
    if (main)
      objects.push(
        imageObject(
          main,
          c,
          { x: 0.055, y, w: 0.89, h: 0.79 - y },
          "main-image",
        ),
      );
    else
      text(
        "finding",
        "论文原句",
        p.evidence[0]?.quote,
        0.055,
        y,
        0.89,
        0.49,
        0.039,
      );
  }
  let offset = 0;
  for (const [i, { role, block, asset }] of areas.entries()) {
    const share =
      areas.length === 1
        ? 1
        : plan?.composition === "balanced"
          ? 0.5
          : i === 0
            ? 0.54
            : 0.46;
    const gap = areas.length > 1 ? 0.027 : 0;
    const x = wide ? 0.054 + offset * (0.892 + gap) : 0.054;
    const top = wide ? y : y + offset * (0.894 - y + gap);
    const w = wide ? share * (0.892 + gap) - gap : 0.892;
    const h = wide ? 0.887 - y : share * (0.894 - y + gap) - gap;
    // A portrait scientific plate needs all of its row height for the original
    // diagram/table. Keep the explanation in a side column for those rows.
    if (!wide && asset) {
      const copyW = 0.263,
        imageX = x + copyW + 0.036,
        imageW = w - copyW - 0.036;
      text(
        role + "-header",
        role === "method" ? "方法标题" : "结果标题",
        block?.heading || (role === "method" ? "方法原图" : "实验结果"),
        x,
        top + 0.011,
        copyW,
        0.062,
        0.032,
        true,
        accent,
      );
      if (block)
        text(
          role + "-body",
          role === "method" ? "方法说明" : "结果说明",
          block.text,
          x,
          top + 0.084,
          copyW,
          h - 0.113,
          0.022,
        );
      objects.push(
        imageObject(
          asset,
          c,
          { x: imageX, y: top, w: imageW, h: h - 0.034 },
          role + "-image",
        ),
      );
      text(
        role + "-source",
        role === "method" ? "方法图出处" : "结果表出处",
        asset.name,
        imageX,
        top + h - 0.025,
        imageW,
        0.024,
        0.016,
        false,
        "#52616a",
      );
    } else {
      const head = wide ? 0.052 : 0.046,
        body = block ? (asset ? 0.092 : 0.18) : 0;
      text(
        role + "-header",
        role === "method" ? "方法标题" : "结果标题",
        block?.heading || (role === "method" ? "方法原图" : "实验结果"),
        x,
        top,
        w,
        head,
        0.032,
        true,
        accent,
      );
      if (block)
        text(
          role + "-body",
          role === "method" ? "方法说明" : "结果说明",
          block.text,
          x,
          top + head,
          w,
          body,
          0.025,
        );
      if (asset) {
        const pos = {
          x,
          y: top + head + body + 0.007,
          w,
          h: Math.max(0.03, h - head - body - 0.039),
        };
        objects.push(imageObject(asset, c, pos, role + "-image"));
        text(
          role + "-source",
          role === "method" ? "方法图出处" : "结果表出处",
          asset.name,
          x,
          top + h - 0.026,
          w,
          0.025,
          0.016,
          false,
          "#52616a",
        );
      }
    }
    offset += share;
  }
  text(
    "citation",
    "论文出处",
    p.byline || p.title,
    0.054,
    0.946,
    0.89,
    0.037,
    0.016,
    false,
    "#4d5e68",
  );
  if (plan?.caption)
    text(
      "caption",
      "海报附注",
      plan.caption,
      0.054,
      0.902,
      0.89,
      0.04,
      0.019,
      false,
      accent,
    );
  const layout:PosterLayout = {
    background: "#fbfbf8",
    accent,
    objects,
    origin: plan ? "planned" : "fallback",
  };
  return c==="x" ? englishPaperLayout(p,layout) : layout;
}

// A manual PDF crop replaces the primary figure in every existing output.
export function changePaperFigure(p: Paper, figure?: Paper["figure"]): Paper {
  const next = { ...p, figure };
  if (!p.posterLayouts) return next;
  const layouts = { ...p.posterLayouts },
    source = layoutSources(next).find((s) => figure && s.data === figure.data);
  for (const c of Object.keys(layouts) as Channel[]) {
    const layout = layouts[c];
    if (!layout) continue;
    const old = layout.objects.find(
      (o) =>
        o.type === "image" &&
        (o.id === "method-image" ||
          o.id === "main-image" ||
          o.source === "original"),
    );
    if (!layout.edited) {
      layouts[c] = makePaperLayout(
        next,
        c,
        p.process?.plan?.layout,
        source?.id || null,
        p.process?.analysis?.resultTableId,
      );
      continue;
    }
    const ids = new Set(
      old ? [old.id, old.id === "method-image" ? "method-source" : ""] : [],
    );
    let objects = layout.objects.filter((o) => !ids.has(o.id));
    if (source) {
      const bounds = old || { x: 0.32, y: 0.31, w: 0.61, h: 0.25 };
      if (old)
        objects = layout.objects.map((o) =>
          o.id === old.id
            ? imageObject(source, c, bounds, old.id)
            : o.id === "method-source" &&
                o.type === "text" &&
                o.text === old.name
              ? { ...o, text: source.name }
              : o,
        );
      else if (objects.length < 50)
        objects = [...objects, imageObject(source, c, bounds, "method-image")];
    }
    layouts[c] = { ...layout, objects };
  }
  return { ...next, posterLayouts: layouts };
}

export function seedPaperLayout(
  paper: Paper,
  channel: Channel,
  plan: PaperLayoutPlan,
  methodFigureId: string | null,
  resultTableId: string | null,
): Paper {
  const saved = paper.posterLayouts?.[channel];
  if (
    saved &&
    (!saved.origin ||
      saved.edited ||
      (saved.origin === "planned" &&
        (!paper.artwork ||
          saved.objects.some(
            (o) => o.type === "image" && o.source === "artwork",
          ))))
  )
    return paper;
  return {
    ...paper,
    posterLayouts: {
      ...paper.posterLayouts,
      [channel]: makePaperLayout(
        paper,
        channel,
        plan,
        methodFigureId,
        resultTableId,
      ),
    },
  };
}

export function paperLayoutPage(
  p: Paper,
  c: Channel,
  layout: PosterLayout,
  ctx: CanvasRenderingContext2D,
): DrawioPage {
  const { width, height } = platforms[c];
  const elements: DrawioElement[] = [
    {
      name: "纸面底色",
      layer: "底色",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height,
      fill: layout.background,
    },
    {
      name: "刊头底色",
      layer: "底色",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height: height * (width / height > 1.4 ? 0.225 : 0.183),
      fill: "#162c37",
    },
    {
      name: "主题色线",
      layer: "底色",
      type: "rect",
      x: 0,
      y: 0,
      width,
      height: Math.max(4, height * 0.007),
      fill: layout.accent,
    },
  ];
  const sources = layoutSources(p);
  for (const obj of layout.objects) {
    const box = {
      name: obj.name,
      layer: "海报内容",
      x: obj.x * width,
      y: obj.y * height,
      width: obj.w * width,
      height: obj.h * height,
    };
    if (obj.type === "image") {
      const asset = sources.find((s) => s.id === obj.source);
      if (asset) elements.push({ ...box, type: "image", src: asset.data });
      continue;
    }
    let size = obj.size,
      lines: string[] = [];
    for (;;) {
      ctx.font = (obj.bold ? "700 " : "400 ") + size + "px " + font;
      lines = obj.text
        .split(/\r?\n/)
        .flatMap((paragraph) =>
          campaignLines(paragraph, box.width, (t) => ctx.measureText(t).width),
        );
      if (lines.length * size * 1.22 <= box.height || size <= 7) break;
      size = Math.max(7, size * 0.93);
    }
    elements.push({
      ...box,
      type: "text",
      text: lines.join("\n"),
      fontSize: size,
      fontFamily: sourceFont,
      color: obj.color,
      bold: obj.bold,
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.22,
    });
  }
  return {
    name: platforms[c].name + " · " + p.headline,
    width,
    height,
    background: layout.background,
    elements,
  };
}

export async function renderPaperLayout(page: DrawioPage) {
  const canvas = document.createElement("canvas");
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext("2d")!;
  for (const el of page.elements) {
    if (el.type === "rect") {
      ctx.fillStyle = el.fill;
      ctx.fillRect(el.x, el.y, el.width, el.height);
    } else if (el.type === "image") {
      const img = new Image();
      img.src = el.src;
      await img.decode();
      ctx.drawImage(img, el.x, el.y, el.width, el.height);
    } else {
      ctx.font = (el.bold ? "700 " : "400 ") + el.fontSize + "px " + font;
      ctx.fillStyle = el.color;
      ctx.textBaseline = "top";
      el.text
        .split("\n")
        .forEach((line, i) =>
          ctx.fillText(
            line,
            el.x,
            el.y + i * el.fontSize * (el.lineHeight || 1.22),
          ),
        );
    }
  }
  return canvas;
}
