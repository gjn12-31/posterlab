import { z } from "zod";
import type { Paper } from "./paper-model";

export const storyRoles = [
  "封面",
  "问题",
  "方法",
  "发现",
  "解读",
  "边界",
  "摘录",
] as const;
export type StoryRole = (typeof storyRoles)[number];
export const storyCardSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(storyRoles),
  title: z.string().max(500),
  body: z.string().max(3000),
  // Keep the verbatim text even when the author later changes a platform's citations.
  quote: z.string().max(3000),
});
export const storyLimit = 9;
export const storySchema = z.array(storyCardSchema).min(2).max(storyLimit);
export type StoryCard = z.infer<typeof storyCardSchema>;
type Evidence = Paper["evidence"][number];

const labels: Record<Exclude<StoryRole, "封面">, string> = {
  问题: "研究从什么问题出发？",
  方法: "研究者怎么做？",
  发现: "研究发现了什么？",
  解读: "作者如何解释这一结果？",
  边界: "结论有哪些限制？",
  摘录: "读一段原文",
};
function roleOf(text: string): Exclude<StoryRole, "封面"> {
  if (/\blimitations?\b|remains? unclear|局限|尚不清楚/i.test(text))
    return "边界";
  if (/consistent with|suggests? that|与.{1,18}(一致|相符)|这提示/i.test(text))
    return "解读";
  if (
    /we (?:have )?(?:found|find|observed|observe|show|resolved)|results? (?:show|suggest)|结果表明|观察到|我们发现/i.test(
      text,
    )
  )
    return "发现";
  if (
    /we (?:have )?(?:introduce|propose|design|develop|assembled|used|use|train)\b|本文提出|我们采用|研究团队使用/i.test(
      text,
    )
  )
    return "方法";
  if (
    /research question|we (?:ask|investigate whether)|remains? challenging|研究问题|亟待解决|尚待解决/i.test(
      text,
    )
  )
    return "问题";
  return "摘录";
}
export function sampleStoryFact(p: Paper, quote: string) {
  if (!p.sample) return undefined;
  if (quote.includes("at a wavelength of 1.3 mm"))
    return {
      title: "把全球的望远镜连起来",
      measure: "1.3 mm",
      caption: "观测波长",
    };
  if (quote.includes("ring with a diameter of 42 ± 3 μas"))
    return {
      title: "M87 中心的亮环有多大？",
      measure: "42 ± 3 μas",
      caption: "环的角直径",
    };
  if (
    quote.includes(
      "consistent with expectations for the shadow of a Kerr black hole",
    )
  )
    return { title: "亮环与哪种预期一致？" };
}
export function evidenceCard(p: Paper, e: Evidence, id: string): StoryCard {
  const role = roleOf(e.quote);
  return {
    id,
    role,
    title: sampleStoryFact(p, e.quote)?.title || labels[role],
    body: e.line,
    quote: e.quote,
  };
}
export function paperStory(p: Paper): StoryCard[] {
  if (p.story) return p.story;
  return [
    {
      id: "cover",
      role: "封面",
      title: p.headline,
      body: p.title !== p.headline ? p.title : "",
      quote: "",
    },
    ...p.evidence.map((e, i) => evidenceCard(p, e, `evidence-${i + 1}`)),
  ];
}
export function moveStoryCard(cards: StoryCard[], index: number, step: -1 | 1) {
  const target = index + step;
  if (
    index < 1 ||
    index >= cards.length ||
    target < 1 ||
    target >= cards.length
  )
    return cards;
  const next = [...cards];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function storyTexts(p: Paper, cards = paperStory(p)) {
  const page = (i: number) => String(i + 1).padStart(2, "0");
  const citation = [p.title, p.byline, p.source].filter(Boolean).join("\n");
  const caption = cards
    .map((card, i) =>
      [i ? `${page(i)} / ${card.title}` : card.title, card.body]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const sources = cards
    .map((c, i) =>
      [
        `${page(i)} · ${c.role} · ${c.title}`,
        c.quote ? "论文原句\n" + c.quote : "封面依据\n" + p.title,
      ].join("\n"),
    )
    .join("\n\n");
  return {
    caption: `${caption}\n\n论文出处\n${citation}`,
    sources: `${citation}\n\n${sources}`,
  };
}

export function storyIssue(p: Paper) {
  const body = p.body.replace(/\s+/g, " ");
  for (const [index, card] of paperStory(p).entries()) {
    if (!card.title.trim()) return `请补上第 ${index + 1} 张的卡片标题。`;
    if (card.role !== "封面" && !card.body.trim())
      return `请填写第 ${index + 1} 张的卡片解读。`;
    if (
      card.role !== "封面" &&
      (!card.quote || !body.includes(card.quote.replace(/\s+/g, " ")))
    )
      return `第 ${index + 1} 张的引文未在论文正文中找到，请重新选择原句。`;
  }
  return "";
}
