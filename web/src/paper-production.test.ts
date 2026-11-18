import { beforeEach, expect, it, vi } from "vitest";
import {
  createPaper,
  readSavedPaper,
  channels,
  type Paper,
} from "./paper-model";
import {
  makePaperLayout,
  seedPaperLayout,
  type PaperLayoutPlan,
} from "./paper-layout";
import { producePaper, preservePaperEdits } from "./paper-production";
import { generatePaperArtwork } from "./paper-artwork";
import { writePaper } from "./outreach";
import { studioFetch } from "./studio-api";

vi.mock("./paper-artwork", () => ({ generatePaperArtwork: vi.fn() }));
vi.mock("./outreach", () => ({ writePaper: vi.fn() }));
vi.mock("./studio-api", () => ({ studioFetch: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const quote =
  "We introduce ClashBench, an executable benchmark for destructive resource preemption.";
function paper() {
  return createPaper(
    quote,
    "ClashBench: Conflicts Leading Agents to Seize and Harm",
    "https://arxiv.org/abs/2609.19892",
    "",
    quote,
  );
}
const plan: PaperLayoutPlan = {
  title: "共享环境里的资源冲突",
  subtitle: "同时检查新任务与既有任务",
  accent: "teal",
  composition: "method-first",
  blocks: [
    {
      role: "problem",
      heading: "共享环境",
      text: "两项任务可能争用同一资源。",
    },
    {
      role: "method",
      heading: "构建评测",
      text: "比较任务完成情况和已有任务的健康状态。",
    },
  ],
  caption: "可对照两项检查。",
};
const local = { live: false, source: "text" as const, imageModel: "" };
const live = { live: true, source: "pdf" as const, imageModel: "test-image" };
function ready(): Paper {
  const p = paper();
  p.process = {
    source: "pdf",
    live: true,
    stages: {},
    analysis: {
      provider: "test",
      model: "reader",
      methodFigureId: null,
      resultTableId: null,
      reading: {
        problem: { text: "研究资源冲突", refs: [{ page: 1, quote }] },
        method: { text: "对照两项检查", refs: [{ page: 1, quote }] },
        result: { text: "", refs: [] },
      },
    },
    plan: { provider: "test", model: "layout", layout: plan },
  };
  return p;
}

it("creates four editable text-only posters without inventing a figure or table", async () => {
  const p = await producePaper(paper(), local, () => {});
  expect(Object.keys(p.posterLayouts || {}).sort()).toEqual(
    [...channels].sort(),
  );
  for (const c of channels) {
    const layout = p.posterLayouts![c]!;
    expect(layout.objects.some((o) => o.type === "image")).toBe(false);
    expect(layout.objects.find((o) => o.id === "finding")?.type).toBe("text");
    const later = seedPaperLayout(p, c, plan, null, null);
    expect(later.posterLayouts![c]!.origin).toBe("planned");
    expect(
      later.posterLayouts![c]!.objects.some((o) => o.id === "result-image"),
    ).toBe(false);
    const edited = {
      ...p,
      posterLayouts: { [c]: { ...layout, edited: true } },
    };
    expect(seedPaperLayout(edited, c, plan, null, null)).toBe(edited);
  }
  expect(readSavedPaper(p).id).toBe(p.id);
  expect(studioFetch).not.toHaveBeenCalled();
});

it("finishes copy review before image generation, reuses image receipt, and retries only absent channels", async () => {
  const p = ready();
  p.headline = "我手写的标题";
  p.edits = { red: "作者手动定稿" };
  const order: string[] = [];
  vi.mocked(writePaper).mockImplementationOnce(async () => {
    order.push("copy");
    await new Promise((r) => setTimeout(r, 10));
    order.push("review done");
    return {
      ...p,
      model: "writer",
      edits: {
        x: "First launch post",
        red: "model must not replace the approved post",
      },
    };
  });
  vi.mocked(generatePaperArtwork).mockImplementationOnce(async (_p, key) => {
    order.push("art");
    return { artworkNotice: "图片待下载", artworkRetryKey: key };
  });
  const first = await producePaper(p, live, () => {});
  expect(order).toEqual(["copy", "review done", "art"]);
  expect(first.headline).toBe("我手写的标题");
  expect(first.edits.red).toBe(p.edits.red);
  expect(first.process?.stages.copy?.state).toBe("failed");
  expect(first.localChannels?.sort()).toEqual(["moments", "wechat"]);
  const receipt = first.artworkRetryKey;
  vi.mocked(writePaper).mockResolvedValueOnce({
    ...p,
    model: "writer",
    edits: { x: "replacement", moments: "分享语", wechat: "公众号" },
  });
  vi.mocked(generatePaperArtwork).mockResolvedValueOnce({
    artwork: { data: "data:image/webp;base64,AQ==", model: "image" },
  });
  const final = await producePaper(first, live, () => {});
  expect(generatePaperArtwork).toHaveBeenLastCalledWith(
    expect.anything(),
    receipt,
  );
  expect(final.edits).toEqual({
    x: "First launch post",
    red: "作者手动定稿",
    moments: "分享语",
    wechat: "公众号",
  });
  expect(final.process?.stages.copy?.state).toBe("done");
  expect(
    final.posterLayouts?.x?.objects.some((o) => o.id === "concept-image"),
  ).toBe(true);
  await producePaper(final, live, () => {});
  expect(generatePaperArtwork).toHaveBeenCalledTimes(2);
  expect(writePaper).toHaveBeenCalledTimes(2);
});

it("preserves edits made while a checkpoint is being saved, including removal of old channel references", () => {
  const initial = paper();
  const layout = makePaperLayout(initial, "red", plan);
  initial.evidenceIds = { red: [1] };
  const produced = {
    ...initial,
    edits: { red: "旧自动回复", x: "新稿" },
    posterLayouts: { red: layout, x: layout },
    channelVoices: { red: "author" as const },
  };
  const current = {
    ...initial,
    byline: "手动署名",
    edits: { red: "用户刚确认的稿子" },
    evidenceIds: {},
    posterLayouts: { red: { ...layout, edited: true } },
  };
  const merged = preservePaperEdits(initial, produced, current);
  expect(merged.edits).toEqual({ red: "用户刚确认的稿子", x: "新稿" });
  expect(merged.byline).toBe("手动署名");
  expect(merged.evidenceIds?.red).toBeUndefined();
  expect(merged.posterLayouts?.red).toBe(current.posterLayouts.red);
  expect(merged.posterLayouts?.x).toBe(produced.posterLayouts.x);
  expect(readSavedPaper(merged).id).toBe(initial.id);
});

it("typesets the English X edition from its release and verified English evidence without replacing an author's layout", () => {
  const p = ready();
  p.coverTitleEn = "Two tasks, one resource";
  p.coverLineEn = "ClashBench tests agents in shared environments.";
  p.edits.x =
    "What happens when one task needs the same resource as another? We invite safety teams to examine this trade-off.";
  p.process!.analysis!.reading.method.refs = [
    {
      page: 4,
      quote: "We evaluate these models through three coding-agent harnesses.",
    },
  ];
  const old = makePaperLayout(p, "red", plan, null, null);
  const result = makePaperLayout(p, "x", plan, null, null);
  const value = (l: typeof result, id: string) => {
    const o = l.objects.find((o) => o.id === id);
    return o?.type === "text" ? o.text : "";
  };
  expect(value(result, "title")).toBe(p.coverTitleEn);
  expect(value(result, "subtitle")).toBe(p.coverLineEn);
  expect(value(result, "method-body")).toBe(
    p.process!.analysis!.reading.method.refs[0].quote,
  );
  expect(value(result, "caption")).toBe(
    "We invite safety teams to examine this trade-off.",
  );
  expect(value(old, "title")).toBe(plan.title);
  expect(
    readSavedPaper({ ...p, posterLayouts: { x: old } }).posterLayouts?.x
      ?.language,
  ).toBe("en");
  const manual = { ...old, edited: true };
  expect(
    readSavedPaper({ ...p, posterLayouts: { x: manual } }).posterLayouts?.x,
  ).toEqual(manual);
  expect(studioFetch).not.toHaveBeenCalled();
});
