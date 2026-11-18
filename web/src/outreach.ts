import { z } from "zod";
import { studioFetch, STATIC_DEMO } from "./studio-api";
import { editionIds } from "./editions";
import type { Brief } from "./model";
import { threadPosts, type Paper } from "./paper-model";

const provenance = { provider: z.literal("StepFun"), model: z.string().min(1) };
const kitSchema = z.object({
  ...provenance,
  headline: z.string().min(1).max(180),
  x: z.array(z.string().min(1)).min(1),
  red: z.string().min(1),
  moments: z.string().min(1),
  wechat: z.string().min(1),
  evidence_ids: z.record(
    z.enum(["x", "red", "wechat", "moments"]),
    z.array(z.number().int().positive()).min(1),
  ),
});
const campaignSchema = z.object({
  ...provenance,
  invitation: z.string().min(1),
  edition: z.enum(editionIds),
  tag: z.string().min(1),
  reason: z.string().min(1),
});
export async function connectedModel(): Promise<string> {
  if (STATIC_DEMO) return "";
  try {
    const r = await studioFetch("/status");
    const d = await r.json();
    return r.ok && d.ai ? String(d.model) : "";
  } catch {
    return "";
  }
}
async function submit(kind: string, payload: unknown, key: string) {
  const r = await studioFetch("/outreach/" + kind, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || !data)
    throw Error(
      typeof data?.detail === "string"
        ? data.detail
        : "生成服务暂不可用，可选择本地排版。",
    );
  return data;
}
export async function writeCampaign(brief: Brief, key: string) {
  return campaignSchema.parse(await submit("campaign", { brief }, key));
}
export async function writePaper(p: Paper, key: string): Promise<Paper> {
  const k = kitSchema.parse(
    await submit(
      "paper",
      {
        title: p.title,
        byline: p.byline || "",
        evidence: p.evidence.map((e) => e.quote),
      },
      key,
    ),
  );
  if (
    Object.values(k.evidence_ids).some((refs) =>
      refs.some((id) => id > p.evidence.length),
    )
  )
    throw Error("来源编号无法对应原句，已保留输入。");
  const citation = p.source ? "原文：" + p.source : "论文：" + p.title;
  return {
    ...p,
    headline: k.headline,
    model: k.model,
    evidenceIds: k.evidence_ids,
    edits: {
      x: threadPosts([...k.x, ...(p.source ? [p.source] : [])]).join("\n\n"),
      red: k.red + "\n\n" + citation,
      moments: k.moments + "\n\n" + citation,
      wechat:
        k.wechat +
        "\n\n" +
        [p.title, p.byline, p.source].filter(Boolean).join("\n"),
    },
  };
}
