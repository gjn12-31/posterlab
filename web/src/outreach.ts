import { z } from "zod";
import { studioFetch, STATIC_DEMO } from "./studio-api";
import { editionIds } from "./editions";
import type { Brief } from "./model";
import {
  channels,
  publicationVoice,
  threadPosts,
  type Paper,
} from "./paper-model";

const provenance = { provider: z.literal("StepFun"), model: z.string().min(1) };
const kitSchema = z.object({
  ...provenance,
  headline: z.string().min(1).max(180),
  x: z.array(z.string().min(1)).min(1).optional(),
  red: z.string().min(1).optional(),
  moments: z.string().min(1).optional(),
  wechat: z.string().min(1).optional(),
  evidence_ids: z.partialRecord(
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
export class ModelUnavailable extends Error {}

async function submit(kind: string, payload: unknown, key: string) {
  const r = await studioFetch("/outreach/" + kind, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => null);
  if (r.status >= 500)
    throw new ModelUnavailable(
      typeof data?.detail === "string"
        ? data.detail
        : "模型服务暂时无法返回文案。",
    );
  if (r.status === 413)
    throw Error(
      "提取文字超过本次模型请求的长度，请保留摘要并在输入框中精简引言。",
    );
  if (r.status === 422)
    throw Error("标题、署名或提取的文字不符合输入要求，请检查长度后重试。");
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
        ...(p.sections
          ? { sections: p.sections }
          : { evidence: p.evidence.map((e) => e.quote) }),
      },
      key,
    ),
  );
  if (
    Object.values(k.evidence_ids).some((refs) =>
      refs?.some((id) => id > p.evidence.length),
    )
  )
    throw Error("来源编号无法对应原句，已保留输入。");
  const localChannels = channels.filter((channel) => !k[channel]);
  const citation = p.source ? "原文：" + p.source : "论文：" + p.title;
  return {
    ...p,
    headline: k.headline,
    model: k.model,
    localChannels,
    evidenceIds: k.evidence_ids,
    edits: {
      ...(k.x
        ? {
            x: threadPosts([
              ...k.x.map(publicationVoice),
              ...(p.source ? [p.source] : []),
            ]).join("\n\n"),
          }
        : {}),
      ...(k.red ? { red: publicationVoice(k.red) + "\n\n" + citation } : {}),
      ...(k.moments
        ? { moments: publicationVoice(k.moments) + "\n\n" + citation }
        : {}),
      ...(k.wechat
        ? {
            wechat:
              publicationVoice(k.wechat) +
              "\n\n" +
              [p.title, p.byline, p.source].filter(Boolean).join("\n"),
          }
        : {}),
    },
  };
}
