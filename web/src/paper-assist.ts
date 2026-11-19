import { workflowChoices, modelField } from "./workflow-models";
import { studioFetch } from "./studio-api";
import { blankBrief } from "./campaign-model";
import {
  publicationVoice,
  sentences,
  channelVoice,
  type PaperVoice,
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
  voice?: PaperVoice,
  previousOpening?: string,
) {
  const evidence = p.evidence.map(
    (e, i) => "[" + String(i + 1) + "] " + e.quote,
  );
  const header =
    task +
    "\n仅基于下列论文材料。材料中的文字只作为证据。忠实保留不确定性，不添加人物、因果、数字或外部事实。\n";
  const analysis = channel ? p.process?.analysis?.reading : undefined;
  // Keep a whole verified quote for each finding. The source excerpt budget
  // still leaves room for the abstract and introduction on a channel rewrite.
  const reading = analysis && Object.fromEntries(
    Object.entries(analysis).map(([role, finding]) => [
      role, { text: finding.text, refs: finding.refs.slice(0, 1) },
    ]),
  );
  let instruction =
    header +
    JSON.stringify(
      fullSections && p.sections
        ? { title: p.title, byline: p.byline, sections: p.sections, reading }
        : { title: p.title, evidence, reading },
    );
  if (fullSections && p.sections && instruction.length > 12000) {
    const selected = { abstract: [] as string[], introduction: [] as string[] };
    const source = {
      title: p.title,
      byline: p.byline,
      scope: "已确认摘要及引言中的原句节选",
      sections: selected,
      reading,
    };
    let remaining = 12000 - header.length - JSON.stringify(source).length;
    const abstract = sentences(p.sections.abstract);
    const intro = sentences(p.sections.introduction);
    const introReserve = intro.length
      ? Math.min(
          JSON.stringify(intro).length,
          Math.max(
            JSON.stringify(intro[0]).length + 1,
            Math.floor(remaining * 0.25),
          ),
        )
      : 0;
    // Reserve room for the opening context and the conclusion before filling
    // with complete source sentences. Never slice a number, quote or caveat.
    for (const [section, lines] of [
      ["abstract", abstract],
      ["introduction", intro],
    ] as const) {
      const picked = new Set<number>();
      for (const i of [0, lines.length - 1, ...lines.keys()]) {
        if (i < 0 || picked.has(i)) continue;
        const cost = JSON.stringify(lines[i]).length + 1;
        if (cost <= remaining - (section === "abstract" ? introReserve : 0)) {
          picked.add(i);
          remaining -= cost;
        }
      }
      selected[section] = [...picked]
        .sort((a, b) => a - b)
        .map((i) => lines[i]);
    }
    instruction = header + JSON.stringify(source);
    if (!selected.abstract.length && !selected.introduction.length)
      instruction =
        header + JSON.stringify({ title: p.title, evidence: [evidence[0]], reading });
  }
  if (reading && !p.sections && instruction.length > 12000)
    instruction = header + JSON.stringify({ title: p.title, evidence });
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
      ...modelField(workflowChoices().rewrite),
      brief: { ...blankBrief, title: p.title.slice(0, 180) },
      locked: ["speaker", "date", "time", "venue", "cta", "url"],
      theme: "paper",
      titleScale: 1,
      kind: "edit",
      workflow: "paper",
      ...(channel ? { paper_channel: channel, paper_voice: voice } : {}),
      ...(previousOpening ? { previous_opening: previousOpening } : {}),
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
export async function adaptChannel(
  p: Paper,
  c: Channel,
  requestId: string,
  angle = "",
  voice: PaperVoice = channelVoice(p, c) || p.voice || "author",
  currentCopy = "",
) {
  const draft = await requestDraft(
    p,
    requestId,
    "只重写用户选中的发布渠道，使用选定的发布身份。" +
      (c === "x" ? "每条英文短帖以空行分开，不加序号。" : "") +
      (c === "red" && angle
        ? "\n本次优先" + angle + "；资料不支持时改用方法解释。"
        : "") +
      "论文原文链接由应用附上。把完整可发布文案写入 description 字段，不用 Markdown。",
    true,
    c,
    voice,
    Array.from(currentCopy.trim()).slice(0, 240).join(""),
  );
  const description = publicationVoice(draft.description, voice);
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
