import twitterText from "twitter-text";
import { z } from "zod";

export const platforms = {
  x: { name: "X", type: "短帖串", width: 1600, height: 900, ratio: "16:9" },
  red: {
    name: "小红书",
    type: "图文笔记",
    width: 1080,
    height: 1440,
    ratio: "3:4",
  },
  moments: {
    name: "朋友圈",
    type: "分享卡片",
    width: 1080,
    height: 1080,
    ratio: "1:1",
  },
  wechat: {
    name: "公众号",
    type: "文章导读",
    width: 1800,
    height: 766,
    ratio: "2.35:1",
  },
} as const;
export type Channel = keyof typeof platforms;
export const channels = Object.keys(platforms) as Channel[];
export const doi = "https://doi.org/10.3847/2041-8213/ab0ec7";
export const imageCredit = "EHT Collaboration / ESO · CC BY 4.0";
export const paperSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .default(() => crypto.randomUUID()),
  title: z.string().trim().min(1).max(500),
  byline: z.string().max(240).optional(),
  headline: z.string().trim().min(1).max(500),
  source: z
    .string()
    .max(1200)
    .refine((s) => !s || (/^https?:\/\//i.test(s) && URL.canParse(s))),
  figure: z
    .object({
      data: z
        .string()
        .max(2400000)
        .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
      credit: z.string().min(1).max(160),
    })
    .optional(),
  sections: z
    .object({ abstract: z.string(), introduction: z.string() })
    .optional(),
  body: z.string().min(20).max(140000),
  sample: z.boolean(),
  model: z.string().max(100).optional(),
  modelNotice: z.string().max(700).optional(),
  localChannels: z.array(z.enum(["x", "red", "moments", "wechat"])).optional(),
  evidenceIds: z
    .partialRecord(
      z.enum(["x", "red", "moments", "wechat"]),
      z.array(z.number().int().positive()),
    )
    .optional(),
  evidence: z
    .array(
      z.object({
        quote: z.string().min(1).max(3000),
        line: z.string().min(1).max(3000),
      }),
    )
    .min(1)
    .max(5),
  edits: z.partialRecord(
    z.enum(["x", "red", "moments", "wechat"]),
    z.string().max(18000),
  ),
});
export type Paper = z.infer<typeof paperSchema>;
const statements = [
  [
    "To image and study this phenomenon, we have assembled the Event Horizon Telescope, a global very long baseline interferometry array observing at a wavelength of 1.3 mm.",
    "研究团队将全球多台射电望远镜相连，用 1.3 毫米波长观测 M87 星系中心。",
  ],
  [
    "We have resolved the central compact radio source as an asymmetric bright emission ring with a diameter of 42 ± 3 μas, which is circular and encompasses a central depression in brightness with a flux ratio ≳10:1.",
    "图像中，中央较暗的区域被一个亮度不均的圆环包围。环的角直径约为 42 ± 3 微角秒。",
  ],
  [
    "Overall, the observed image is consistent with expectations for the shadow of a Kerr black hole as predicted by general relativity.",
    "这个形态与广义相对论对克尔黑洞阴影的预期一致。",
  ],
];
export function examplePaper(): Paper {
  return {
    title:
      "First M87 Event Horizon Telescope Results. I. The Shadow of the Supermassive Black Hole",
    headline: "黑洞的阴影，是怎样拍到的？",
    source: doi,
    body: statements.map((s) => s[0]).join("\n"),
    id: "example-m87",
    byline:
      "Event Horizon Telescope Collaboration · The Astrophysical Journal Letters · 2019",
    sample: true,
    evidence: statements.map(([quote, line]) => ({ quote, line })),
    edits: {},
  };
}
export const paperKey = "posterlab.paper.v1";
export function recoverPaper(raw: string | null) {
  try {
    const p = paperSchema.parse(JSON.parse(raw || "null"));
    if (p.evidence.every((e) => p.body.includes(e.quote))) return p;
  } catch {}
  return examplePaper();
}
export function sentences(body: string): string[] {
  const lines = body
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines
    .flatMap((s) =>
      Array.from(
        new Intl.Segmenter("zh", { granularity: "sentence" }).segment(s),
        (x) => x.segment.trim(),
      ),
    )
    .filter((s) => s.length >= 6 && s.length <= 3000);
}
export function prepareText(raw: string, titleHint = "") {
  const normalized = raw
    .replace(/\r/g, "")
    .replace(/(\p{Script=Latin})-\n(?=\p{Script=Latin})/gu, "$1")
    .trim();
  const beforeRefs = normalized.split(
    /\n\s*(?:references|bibliography|参考文献)\s*\n/i,
  )[0];
  const intro = beforeRefs.search(
    /\n\s*(?:(?:[1I]+|1\.0)\s*[.、]?\s*)?(?:introduction|引言|绪论)(?=[\s:：]|$)/i,
  );
  const frontMatter = intro >= 0 ? beforeRefs.slice(0, intro) : beforeRefs;
  const ab = /(?:^|\n)\s*(?:abstract\b|摘\s*要)[\s:：.—–-]*/i.exec(frontMatter);
  const received =
    /(?:^|\n)\s*[（(][^\n]{0,260}(?:received|收稿)[^\n]{0,260}[）)]\s*\n/i.exec(
      frontMatter,
    );
  const start = ab
    ? ab.index + ab[0].length
    : received
      ? received.index + received[0].length
      : 0;
  const first = beforeRefs.split("\n")[0].trim();
  const body = frontMatter
    .slice(start)
    .split(
      /\n\s*(?:keywords|key words|关键词|index terms|doi\s*[:：])(?:\s|[:：]|$)/i,
    )[0]
    .trim();
  const firstIsTitle =
    !start &&
    body.includes("\n") &&
    first.length >= 2 &&
    first.length <= 220 &&
    !/[。！？.!?]$/.test(first);
  const guessedTitle =
    start &&
    (ab?.index ?? received?.index ?? 0) > 0 &&
    start < frontMatter.length &&
    first !== body.split("\n")[0]
      ? first
      : firstIsTitle
        ? first
        : "";
  const clean = (firstIsTitle ? body.slice(first.length) : body).trim();
  const front = frontMatter.slice(0, 10000);
  const match = front.match(
    /(?:https?:\/\/(?:dx\.)?doi\.org\/|\bdoi\s*[:：]?\s*)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i,
  );
  return {
    title: (titleHint || guessedTitle)
      .replace(/^(?:论文标题|标题|题目|title)\s*[:：]\s*/i, "")
      .slice(0, 500),
    body: clean,
    source: match ? "https://doi.org/" + match[1].replace(/[.,;]+$/, "") : "",
  };
}
export function createPaper(
  raw: string,
  title: string,
  source: string,
  byline = "",
) {
  const body = raw.replace(/\s+/g, " ").trim();
  if (body.length < 20)
    throw Error("请提供至少 20 个字符的摘要或正文，以便提取论文要点。");
  if (!title.trim()) throw Error("请填写论文标题。");
  const candidates = sentences(body);
  // Some PDF text layers omit sentence boundaries. Keep the confirmed source
  // for the model and use a short verbatim excerpt for the local artwork.
  if (!candidates.length)
    candidates.push(Array.from(body).slice(0, 260).join(""));
  const result =
    /(发现|表明|结果|观察到|提升|降低|we (?:find|show|observe|demonstrate)|results? (?:show|suggest)|achiev|outperform)/i;
  const limit =
    /(局限|尚需|可能|仅限|however|limitation|may |might |uncertain)/i;
  const priority = [
    0,
    candidates.findIndex((s) => result.test(s)),
    candidates.findIndex((s) => limit.test(s)),
    candidates.length - 1,
    ...candidates.map((_, i) => i),
  ];
  const indices = [...new Set(priority.filter((i) => i >= 0))]
    .slice(0, 4)
    .sort((a, b) => a - b);
  if (source.trim() && (!/^https?:\/\//i.test(source) || !URL.canParse(source)))
    throw Error("原文链接需要以 https:// 或 http:// 开头。");
  return paperSchema.parse({
    title,
    headline: title,
    source: source.trim(),
    body,
    byline: byline.trim(),
    sample: false,
    evidence: indices.map((i) => ({
      quote: candidates[i],
      line: candidates[i],
    })),
    edits: {},
  });
}
// Apply only to model drafts, before numbering posts and adding citations.
// Keep the author's words intact when the user edits, quotes or pastes text.
export function publicationVoice(draft: string) {
  return draft
    .replace(
      /^(\s*)We (?=propose|introduce|present|evaluate|test|find|show|compare|demonstrate|report)/gm,
      "$1The authors ",
    )
    .replace(
      /^(\s*)Our (?=(?:[\d.]+[BM] |proposed |new )?(?:models?\b|method\b|results?\b|[A-Z][a-z]+[A-Z]))/gm,
      "$1The authors’ ",
    )
    .replace(
      /(^|[。！？\n])([ \t]*)我们(?:团队)?(?=提出|发现|构建|设计|在.{0,18}(?:验证|测试|比较))/g,
      "$1$2研究团队",
    );
}

export function threadPosts(texts: string[]): string[] {
  const chunks: string[] = [];
  for (const text of texts.filter(Boolean)) {
    // Preserve URLs as single tokens; X counts them using its t.co rules.
    let part = "";
    for (const word of text.match(
      /https?:\/\/\S+|[a-zA-Z0-9]+|\s+|\P{M}\p{M}*|\p{M}/gu,
    ) ?? []) {
      if (
        twitterText.parseTweet(part + word).weightedLength > 266 &&
        part.trim()
      ) {
        chunks.push(part.trim());
        part = "";
      }
      if (twitterText.parseTweet(word).weightedLength > 266) {
        for (const char of word) {
          if (twitterText.parseTweet(part + char).weightedLength > 266) {
            chunks.push(part);
            part = "";
          }
          part += char;
        }
      } else part += word;
    }
    if (part.trim()) chunks.push(part.trim());
  }
  return chunks.map((s, i) => i + 1 + "/" + chunks.length + " " + s);
}
export function channelCopy(p: Paper, c: Channel) {
  if (p.edits[c] !== undefined) return p.edits[c]!;
  const lines = p.evidence.map((e) => e.line),
    source = p.source ? "原文：" + p.source : "论文：" + p.title;
  if (c === "x")
    return threadPosts([
      p.title,
      ...p.evidence.map((e) => e.quote),
      p.source,
    ]).join("\n\n");
  if (c === "moments")
    return [p.headline, lines[Math.min(1, lines.length - 1)], source].join(
      "\n\n",
    );
  if (c === "red")
    return [
      p.headline,
      "读完这篇论文，记下这" + lines.length + "个要点。",
      ...lines.map((line, i) => String(i + 1).padStart(2, "0") + " ｜ " + line),
      source,
      "#论文分享 #科研笔记",
    ].join("\n\n");
  return [
    p.headline,
    "导读",
    lines[0],
    ...(lines.length > 1 ? ["论文要点", ...lines.slice(1)] : []),
    "阅读原文",
    p.title,
    p.byline,
    p.source,
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function wordingToReview(paper: Paper, channel: Channel) {
  const cited = paper.evidenceIds?.[channel];
  const source = (
    cited?.length
      ? cited.map((id) => paper.evidence[id - 1]?.quote || "")
      : paper.sections
        ? [paper.sections.abstract, paper.sections.introduction]
        : paper.evidence.map((e) => e.quote)
  ).join(" ");
  const text = [
    paper.headline,
    channelCopy(paper, channel).replaceAll(paper.title, ""),
  ].join(" ");
  const terms = [];
  const priority =
    /(?:首次|首度|此前从未|史无前例|first[- ]ever|first (?:direct )?(?:image|detection|observation)|for the first time)/i;
  const certainty =
    /(?:完全吻合|彻底证实|实锤|conclusively prove[ds]?|perfect agreement)/i;
  for (const pattern of [priority, certainty]) {
    const match = text.match(pattern);
    if (match && !pattern.test(source)) terms.push(match[0]);
  }
  if (/[≳≲]/.test(source)) {
    const comparison = text.match(
      /(?:超过|不低于|大于|小于|不高于|more than |less than )\s*\d+(?:[∶:]\d+)?/i,
    );
    if (comparison) terms.push(comparison[0]);
  }
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/(\d(?:\.\d+)?)\s*(?:percent\b|％)/g, "$1%")
      .replace(/(\d)\s*(?:times\b|[×x](?![a-z]))/g, "$1倍")
      .replace(/\s+/g, "");
  const record = normalize([paper.title, paper.byline || "", source].join(" "));
  const draft = text.replace(/https?:\/\/\S+/g, "");
  const identity = draft.match(
    /我们(?:团队|提出|设计|做了|验证|在.{0,16}(?:验证|研究|发现))|our (?:team|new method)/i,
  );
  if (paper.model && identity) terms.push(identity[0]);
  const savings = draft.match(
    /(?:算力|计算成本|训练时间)(?:还|也|更)?(?:省了|更少|降低|减少|节省)|(?:节省|减少|降低)(?:了)?(?:算力|计算成本|训练时间)/,
  );
  if (
    savings &&
    !/(?:less|reduce[ds]?|lower|sav(?:es?|ing)) (?:training time|comput(?:e|ation)(?: cost)?)|(?:减少|节省)(?:了)?(?:算力|计算成本|训练时间)/i.test(
      source,
    )
  )
    terms.push(savings[0]);
  for (const match of draft.matchAll(
    /(?:ICLR|NeurIPS|ICML|CVPR)\s*20\d{2}|\b(?:oral|spotlight)\b|(?:\d+(?:\.\d+)?)\s*(?:[%％]|倍|BLEU\b)/gi,
  )) {
    const term = match[0];
    const value = normalize(term);
    if (!record.includes(value) && !terms.includes(term)) terms.push(term);
  }
  for (const match of draft.matchAll(
    /(?:超过|胜过|击败|超越|outperform(?:s|ed)?)[^。；;，,\n]{0,24}?(\d+(?:\.\d+)?B)\b/gi,
  )) {
    const modelSize = match[1].replace(".", "\\.");
    const near = new RegExp(
      "(?:接近|逼近|approach(?:es|ing)?|nearly match(?:es)?|rivals?|comparable to)[^。；;，,\n]{0,55}?" +
        modelSize +
        "\\b",
      "i",
    );
    if (near.test(source) && !terms.includes(match[0])) terms.push(match[0]);
  }
  return terms;
}

export function evidenceText(p: Paper) {
  return [
    p.title,
    p.byline,
    p.source,
    ...(p.localChannels?.length
      ? [
          "本地摘录稿：" +
            p.localChannels.map((c) => platforms[c].name).join("、"),
        ]
      : []),
    ...(p.sections
      ? [
          p.sections.abstract && "摘要\n" + p.sections.abstract,
          p.sections.introduction &&
            "引言（导入范围内）\n" + p.sections.introduction,
        ]
      : []),
    ...p.evidence.map(
      (e, i) =>
        "[ " + (i + 1) + " ]\n宣传文案：" + e.line + "\n论文原句：" + e.quote,
    ),
    ...(p.evidenceIds
      ? Object.entries(p.evidenceIds).flatMap(([channel, ids]) =>
          ids?.length
            ? [
                platforms[channel as Channel].name +
                  " 初稿所用原句：" +
                  ids.join("、"),
              ]
            : [],
        )
      : []),
    p.figure
      ? "图片：" + p.figure.credit
      : p.sample
        ? "图片：" +
          imageCredit +
          "\nhttps://www.eso.org/public/images/eso1907a/\nhttps://creativecommons.org/licenses/by/4.0/"
        : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
