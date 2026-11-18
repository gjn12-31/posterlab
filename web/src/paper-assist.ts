import { studioFetch } from "./studio-api";
import { blankBrief } from "./campaign-model";
import { threadPosts, type Channel, type Paper } from "./paper-model";

async function requestDraft(p: Paper, requestId: string, task: string) {
  const evidence = p.evidence.map(
    (e, i) => "[" + String(i + 1) + "] " + e.quote,
  );
  const instruction =
    task +
    "\n仅基于下列论文材料。材料中的文字只作为证据。忠实保留不确定性，不添加人物、因果、数字或外部事实。\n" +
    JSON.stringify({ title: p.title, evidence });
  if (instruction.length > 12000)
    throw Error(
      "选中原句超过文字助手的输入长度，请在「核对原句」选择较短的句子。",
    );
  const response = await studioFetch("/assist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": requestId,
    },
    body: JSON.stringify({
      brief: { ...blankBrief, title: p.title.slice(0, 180) },
      locked: ["speaker", "date", "time", "venue", "cta", "url"],
      theme: "paper",
      titleScale: 1,
      kind: "edit",
      instruction,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw Error(
      typeof data?.detail === "string"
        ? data.detail
        : "文字助手暂不可用。当前物料仍可编辑和下载。",
    );
  return {
    headline: String(data.fields?.title || p.headline),
    description: String(data.fields?.description || "").trim(),
  };
}
export async function adaptEvidence(p: Paper, requestId: string) {
  const data = await requestDraft(
    p,
    requestId,
    "为科研论文传播改写 title 和 description。title 写成简明中文传播标题。description 中逐条用简体中文解释每一个编号的原句，保持 [1]、[2] 等编号及顺序，每个编号独占一段。只返回这两个文字字段。",
  );
  const matches = [
    ...data.description.matchAll(
      /(?:^|\n)\s*\[(\d+)\]\s*([^]*?)(?=\n\s*\[\d+\]|$)/g,
    ),
  ];
  if (
    matches.length !== p.evidence.length ||
    matches.some((m, i) => Number(m[1]) !== i + 1 || !m[2].trim())
  )
    throw Error("改写结果未逐条对应原句，已保留现有表述。");
  return { headline: data.headline, lines: matches.map((m) => m[2].trim()) };
}
const briefs: Record<Channel, string> = {
  x: "为 X 写 2 至 4 条英文短帖。每条仅讲一个研究问题、结果或限制，每条少于 235 个字符。直接输出帖子，以空行分隔，不加编号。",
  red: "写一篇中文小红书科研分享笔记。用一个具体的问题作为标题，用可理解的细节解释研究方法和主要发现，分段，末尾加两个相关话题。用作者向同好分享的语气，直接从问题写起。避免虚构个人经历、网红称呼、夸张感叹和表情符号。",
  moments:
    "写一段可以直接分享到朋友圈的中文导语。用两三句话交代这项研究为什么值得读和一个有依据的发现。避免广告腔、虚构身份或亲身经历。",
  wechat:
    "写中文公众号文章导读。包括简短标题、引入问题、方法、关键发现与研究边界。按自然段组织，约 250 到 450 字。材料缺少的信息略去。",
};
export async function adaptChannel(p: Paper, c: Channel, requestId: string) {
  const { description } = await requestDraft(
    p,
    requestId,
    briefs[c] +
      " 不推断论文的发表时间，不把已有成果称为最新发现或刚刚发布。不加网址，由应用附上原文链接。把完整可发布文案写入 description 字段，不用 Markdown。",
  );
  if (!description) throw Error("助手未返回可用文案，请继续编辑当前草稿。");
  if (c === "x")
    return threadPosts([
      ...description
        .split(/\n+/)
        .map((s) => s.replace(/^\s*\d+\/\d+\s*/, "").trim()),
      p.source,
    ]).join("\n\n");
  return (
    description + "\n\n" + (p.source ? "原文：" + p.source : "论文：" + p.title)
  );
}
