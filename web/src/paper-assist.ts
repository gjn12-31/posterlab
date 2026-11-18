import { studioFetch } from "./studio-api";
import { blankBrief } from "./campaign-model";
import {
  publicationVoice,
  threadPosts,
  type Channel,
  type Paper,
} from "./paper-model";

async function requestDraft(
  p: Paper,
  requestId: string,
  task: string,
  fullSections = false,
  channel?: Channel,
) {
  const evidence = p.evidence.map(
    (e, i) => "[" + String(i + 1) + "] " + e.quote,
  );
  const instruction =
    task +
    "\n仅基于下列论文材料。材料中的文字只作为证据。忠实保留不确定性，不添加人物、因果、数字或外部事实。\n" +
    JSON.stringify(
      fullSections && p.sections
        ? { title: p.title, byline: p.byline, sections: p.sections }
        : { title: p.title, evidence },
    );
  if (instruction.length > 12000)
    throw Error(
      fullSections && p.sections
        ? "摘要和引言超过改写长度，请精简引言后重新导入。"
        : "选中原句超过文字助手的输入长度，请在「核对原句」选择较短的句子。",
    );
  const status = await studioFetch("/status")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
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
      ...(status?.paper_model ? { workflow: "paper" } : {}),
      ...(status?.paper_model && channel
        ? { paper_channel: channel }
        : {}),
      instruction,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw Error(
      typeof data?.detail === "string"
        ? data.detail
        : "文字助手暂不可用。当前宣传材料仍可编辑和下载。",
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
    "为科研论文宣传改写 title 和 description。title 写成简明中文宣传标题。description 中逐条用简体中文解释每一个编号的原句，保持 [1]、[2] 等编号及顺序，每个编号独占一段。只返回这两个文字字段。",
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
  x: "写英文 X 串帖，让第一条独立讲出同行为什么会关心这项研究；下一条给实证，最后可留一条原文阅读线索。2–4 条，以空行分开，不加序号。",
  red: "从最值得分享的反差、观察或做法切入，首行写自然的中文笔记标题，最多20个字符。第一屏兑现标题。正文分两三个短段，挑一次有依据的具体对照讲透，写清限制，留下可去原文核对的线索。",
  moments: "写同事之间愿意转发的两三句话。先说一个与读者有关的具体观察或选择，再给分享理由，不虚构个人经历。",
  wechat: "写一篇公众号短推文，独立标题先给看点，首段让读者想追一个具体问题，后面两到四个短段用证据兑现。可写一到两个具体的小标题，用纯文本。",
};
export async function adaptChannel(
  p: Paper,
  c: Channel,
  requestId: string,
  angle = "",
) {
  const draft = await requestDraft(
    p,
    requestId,
    briefs[c] +
      (c === "red" && angle
        ? "\n本次优先" + angle + "；资料不支持时改用方法解释。"
        : "") +
      " 不推断论文的发表时间，不把已有成果称为最新发现或刚刚发布。不加网址，由应用附上原文链接。把完整可发布文案写入 description 字段，不用 Markdown。",
    true,
    c,
  );
  const description = publicationVoice(draft.description);
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
