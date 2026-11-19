import { workflowChoices, modelField } from "./workflow-models";
import { studioFetch } from "./studio-api";
import { readingPayload } from "./paper-reading-payload";
import { generatePaperArtwork } from "./paper-artwork";
import { channels, applyPaperDrafts, type Paper } from "./paper-model";
import { seedPaperLayout, makePaperLayout } from "./paper-layout";
import { writePaper } from "./outreach";
import {
  readingSchema,
  layoutSchema,
  type PaperProcess,
  type Stage,
  type ProcessEntry,
} from "./paper-process-model";

async function postStage(path: string, key: string, payload: unknown) {
  const response = await studioFetch("/outreach/paper-" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok)
    throw Error(
      typeof body?.detail === "string"
        ? body.detail
        : "模型服务未完成本步骤，可重试。",
    );
  return body;
}

export async function producePaper(
  original: Paper,
  options: { live: boolean; imageModel: string; source: "text" | "pdf" },
  publish: (paper: Paper) => void,
) {
  let p = original;
  let process: PaperProcess = original.process || {
    source: options.source,
    live: options.live,
    stages: {},
  };
  const selected = workflowChoices();
  // Keep a run's explicit choices with its checkpoints. A resumed paid image
  // request must still refer to the model that issued the download receipt.
  const models = (process.live && process.models) || {
    reading: selected.reading,
    layout: selected.layout,
    writing: selected.writing,
    paperArt: selected.paperArt,
  };
  process = { ...process, live: options.live, models: options.live ? models : undefined };
  function record(stage: Stage, entry: ProcessEntry) {
    process = { ...process, stages: { ...process.stages, [stage]: entry } };
    p = { ...p, process };
    publish(p);
  }
  function start(stage: Stage, detail: string, reusable?: string) {
    const prev = process.stages[stage];
    const key =
      reusable ||
      (prev?.state === "working" && prev.key ? prev.key : crypto.randomUUID());
    record(stage, { state: "working", detail, key });
    return key;
  }
  function fail(stage: Stage, err: unknown) {
    record(stage, {
      state: "failed",
      detail: (err instanceof Error
        ? err.message
        : "服务连接中断，可重试。"
      ).slice(0, 600),
    });
  }
  const visuals = p.visuals || [];
  const pages = p.sourcePages?.length
    ? p.sourcePages
    : [
        { page: 1, text: (p.sections?.abstract || p.body).slice(0, 20000) },
        ...(p.sections?.introduction
          ? [{ page: 2, text: p.sections.introduction.slice(0, 20000) }]
          : []),
      ];
  if (!process.stages.source)
    record("source", {
      state: "done",
      detail:
        options.source === "pdf"
          ? "已读取 " +
            pages.length +
            " 页正文，定位 " +
            visuals.filter((v) => v.kind === "figure").length +
            " 幅图、" +
            visuals.filter((v) => v.kind === "table").length +
            " 张表。"
          : "已收下文字材料，后续引文对应输入的段落。",
    });
  if (options.live && !process.analysis) {
    const key = start("read", "模型正在选择方法图、结果表，并核对原文依据。");
    try {
      const raw = await postStage(
        "reading",
        key,
        readingPayload({
          ...modelField(models.reading),
          title: p.title,
          byline: p.byline || "",
          sections: p.sections,
          pages,
          candidates: visuals.map(({ id, kind, page, label, caption }) => ({
            id,
            kind,
            page,
            label,
            caption,
          })),
        }),
      );
      const analysis = readingSchema.parse(raw);
      process = { ...process, analysis };
      record("read", {
        state: "done",
        detail: "已整理研究问题、方法与有出处的实验结果。",
        model: analysis.model,
      });
    } catch (err) {
      fail("read", err);
    }
  } else if (!options.live)
    record("read", { state: "skipped", detail: "本地排版使用选中的原文。" });
  const analysis = process.analysis;
  if (options.live && analysis && !process.plan) {
    const key = start("layout", "模型正在给图、表和研究结论安排阅读顺序。");
    try {
      const plan = layoutSchema.parse(
        await postStage("layout", key, {
          ...modelField(models.layout),
          title: p.title,
          reading: analysis.reading,
          methodFigureId: analysis.methodFigureId,
          resultTableId: analysis.resultTableId,
        }),
      );
      process = { ...process, plan };
      record("layout", {
        state: "done",
        detail: (
          {
            "method-first": "方法优先",
            "results-first": "结果优先",
            balanced: "方法与结果并列",
          } as const
        )[plan.layout.composition],
        model: plan.model,
      });
    } catch (err) {
      fail("layout", err);
    }
  } else if (!process.plan)
    record("layout", { state: "skipped", detail: "选用编辑器的基础版式。" });
  // Only two provider requests can run at once. Finish the layout before these start.
  const art = async () => {
    if (p.artwork) {
      if (process.stages.art?.state !== "done")
        record("art", {
          state: "done",
          detail: "已保留现有背景图。",
          model: p.artwork.model,
        });
      return;
    }
    if (!options.live || !options.imageModel) {
      record("art", {
        state: "skipped",
        detail: "使用纯色画布，保留原论文图表。",
      });
      return;
    }
    const key = start(
      "art",
      "图像服务正在制作背景。原论文图表单独排入。",
      p.artworkRetryKey,
    );
    const result = await generatePaperArtwork(p, key, models.paperArt || "");
    p = { ...p, ...result };
    if (result.artwork)
      record("art", {
        state: "done",
        detail: "背景图已返回，可独立于原图编辑。",
        model: result.artwork.model,
      });
    else
      fail(
        "art",
        new Error(result.artworkNotice || "背景未生成，已使用基础底色。"),
      );
  };
  const copy = async () => {
    if (!options.live) {
      record("copy", { state: "skipped", detail: "已按平台整理本地摘录。" });
      return;
    }
    if (process.stages.copy?.state === "done") return;
    const key = start("copy", "正在为四个平台分别拟稿，核对邀请语与研究依据。");
    try {
      const kit = await writePaper(p, key, models.writing || "");
      const selected = channels.filter(
        (c) => !!kit.edits[c] && (!p.edits[c] || p.localChannels?.includes(c)),
      );
      const merged = applyPaperDrafts(p, kit, selected);
      p = {
        ...merged,
        headline:
          p.headline === p.title || (!original.process && !original.model)
            ? kit.headline
            : p.headline,
        coverLine: p.coverLine || kit.coverLine,
        coverTitleEn: p.coverTitleEn || kit.coverTitleEn,
        coverLineEn: p.coverLineEn || kit.coverLineEn,
        model: kit.model,
        modelNotice: undefined,
        localChannels: channels.filter(
          (c) => !merged.edits[c] || merged.localChannels?.includes(c),
        ),
      };
      const partial = !!p.localChannels?.length;
      record("copy", {
        state: partial ? "failed" : "done",
        detail: partial
          ? "部分平台保留了本地摘录，可重试补齐。"
          : "已生成 X、小红书、朋友圈和公众号的宣传稿。",
        model: kit.model,
      });
    } catch (err) {
      p = {
        ...p,
        modelNotice: (err instanceof Error
          ? err.message
          : "模型未返回文案"
        ).slice(0, 600),
        localChannels: channels.filter(
          (c) => !p.edits[c] || p.localChannels?.includes(c),
        ),
      };
      fail("copy", err);
    }
  };
  // A single copy request can open a second provider call for editorial review.
  // Let it finish before reserving a slot for artwork; each failure is handled
  // locally, so an unavailable writer still allows an illustration to complete.
  await copy();
  await art();
  start("compile", "正在把研究内容和原始图表写入可编辑图层。");
  const plan = process.plan?.layout;
  if (plan && analysis) {
    for (const c of channels)
      p = seedPaperLayout(
        p,
        c,
        plan,
        analysis.methodFigureId,
        analysis.resultTableId,
      );
  } else {
    for (const c of channels) {
      const saved = p.posterLayouts?.[c];
      if (
        saved &&
        (!saved.origin ||
          saved.edited ||
          !p.artwork ||
          saved.objects.some(
            (o) => o.type === "image" && o.source === "artwork",
          ))
      )
        continue;
      p = {
        ...p,
        posterLayouts: { ...p.posterLayouts, [c]: makePaperLayout(p, c) },
      };
    }
  }
  record("compile", {
    state: "done",
    detail: plan
      ? "四种画幅已排好，可拖动文字、图表并下载 Draw.io。"
      : "基础海报已就绪，可在画布调整并导出。",
  });
  return p;
}

// Checkpoint writes may finish after the author edits the same draft in the
// open workspace. Apply the generated patches only to still-unchanged fields.
export function preservePaperEdits(
  initial: Paper,
  produced: Paper,
  current: Paper,
): Paper {
  if (initial.id !== current.id) return current;
  const out = { ...produced };
  const scalarKeys = [
    "headline",
    "title",
    "byline",
    "source",
    "coverLine",
    "coverLineEn",
    "coverTitleEn",
    "voice",
    "figure",
    "artwork",
    "evidence",
    "story",
    "sections",
    "body",
    "visuals",
    "sourcePages",
  ] as const;
  for (const key of scalarKeys)
    if (current[key] !== initial[key])
      Object.assign(out, { [key]: current[key] });
  for (const channel of channels) {
    if (current.edits[channel] !== initial.edits[channel]) {
      out.edits = { ...out.edits };
      const copy = current.edits[channel];
      if (copy !== undefined) out.edits[channel] = copy;
      else delete out.edits[channel];
      out.channelVoices = { ...out.channelVoices };
      const voice = current.channelVoices?.[channel];
      if (voice) out.channelVoices[channel] = voice;
      else delete out.channelVoices[channel];
      out.evidenceIds = { ...out.evidenceIds };
      const refs = current.evidenceIds?.[channel];
      if (refs) out.evidenceIds[channel] = refs;
      else delete out.evidenceIds[channel];
      if (!current.localChannels?.includes(channel))
        out.localChannels = out.localChannels?.filter((c) => c !== channel);
    }
    if (current.posterLayouts?.[channel] !== initial.posterLayouts?.[channel]) {
      out.posterLayouts = { ...out.posterLayouts };
      const layout = current.posterLayouts?.[channel];
      if (layout) out.posterLayouts[channel] = layout;
      else delete out.posterLayouts[channel];
    }
  }
  return out;
}
