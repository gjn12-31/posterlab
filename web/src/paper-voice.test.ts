import { beforeEach, expect, it, vi } from "vitest";
import { studioFetch } from "./studio-api";
import { writePaper } from "./outreach";
import { adaptChannel } from "./paper-assist";
import {
  applyPaperDrafts,
  channelCopy,
  channelVoice,
  examplePaper,
  readSavedPaper,
  wordingToReview,
  type Paper,
} from "./paper-model";
import exampleCopy from "./paper-example-copy.json";

vi.mock("./studio-api", () => ({ studioFetch: vi.fn(), STATIC_DEMO: false }));
beforeEach(() => vi.mocked(studioFetch).mockReset());

const kit = {
  provider: "Paratera",
  model: "writer",
  headline: "测试这一个研究想法",
  x: ["We propose a different way to compare the models."],
  red: "我们提出一种测试方法。",
  moments: "我们提出这个方法是为了比较两个条件。",
  wechat: "我们提出一种新的研究方法。",
  evidence_ids: {},
  publication_check: {
    channels: ["red"],
    revised: ["red"],
    status: "revised",
    model_calls: 2,
  },
};

it("new drafts default to the author; both requests and returned copy follow the selected voice", async () => {
  vi.mocked(studioFetch).mockImplementation(async () => Response.json(kit));
  const input = examplePaper();
  const author = await writePaper(input, "author-test");
  const editor = await writePaper({ ...input, voice: "editor" }, "editor-test");
  expect(
    vi
      .mocked(studioFetch)
      .mock.calls.map(([, init]) => JSON.parse(init!.body as string).voice),
  ).toEqual(["author", "editor"]);
  expect(author.edits.x).toContain("We propose");
  expect(author.edits.red).toContain("我们提出");
  expect(editor.edits.red).toContain("研究团队提出");
  expect(wordingToReview(author, "red")).not.toContain("我们提出");
  expect(author.publicationCheck?.revised).toEqual(["red"]);
});

it("a channel rewrite transmits its own voice and long source material as full sentences", async () => {
  vi.mocked(studioFetch).mockImplementation(async () =>
    Response.json({ fields: { description: "We propose a comparison." } }),
  );
  const paper = examplePaper();
  const measured =
    "A measured change of 24.65% occurred under this condition. ";
  paper.sections = {
    abstract: measured.repeat(240),
    introduction: "An earlier study discussed a control. ".repeat(90),
  };
  const oldOpening = "An older summary. ".repeat(28);
  const author = await adaptChannel(paper, "x", "request-author", "", "author", oldOpening);
  const editor = await adaptChannel(paper, "x", "request-editor", "", "editor");
  expect(author).toContain("We propose");
  expect(editor).toContain("The authors propose");
  const bodies = vi.mocked(studioFetch).mock.calls.map(([path, init]) => {
    expect(path).toBe("/assist");
    return JSON.parse(init!.body as string);
  });
  expect(bodies.map((d) => d.paper_voice)).toEqual(["author", "editor"]);
  expect(bodies[0].previous_opening).toBe(oldOpening.slice(0, 240));
  expect(bodies[0].instruction).not.toContain("An older summary");
  expect(bodies[1].previous_opening).toBeUndefined();
  for (const body of bodies) {
    expect(body.workflow).toBe("paper");
    expect(body.paper_channel).toBe("x");
    expect(body.instruction.length).toBeLessThanOrEqual(12000);
    const evidence = JSON.parse(body.instruction.split("\n").at(-1));
    expect(evidence.sections.abstract.length).toBeGreaterThan(0);
    expect(
      evidence.sections.abstract.every((s: string) => s === measured.trim()),
    ).toBe(true);
  }
});

it("previewing then adopting one platform preserves human edits, original evidence and existing artwork", () => {
  const old: Paper = {
    ...examplePaper(),
    model: "old",
    edits: { red: "校订版", x: "My handwritten post", wechat: "我的文章" },
  };
  const result: Paper = {
    ...old,
    model: "new",
    voice: "author",
    headline: "标题试写",
    edits: { red: "作者新文案", x: "New X", moments: "新稿" },
  };
  const next = applyPaperDrafts(old, result, ["red"]);
  expect(old.edits.red).toBe("校订版");
  expect(next.headline).toBe(old.headline);
  expect(next.evidence).toBe(old.evidence);
  expect(next.figure).toBe(old.figure);
  expect(next.edits).toEqual({ ...old.edits, red: "作者新文案" });
  expect(channelVoice(next, "red")).toBe("author");
  expect(channelVoice(next, "x")).toBeUndefined();
  expect(applyPaperDrafts(old, result, [])).toBe(old);
});

it("only untouched legacy demonstration channels migrate; offline excerpts stay unvoiced", () => {
  const old = examplePaper();
  old.edits.red = "手工校订过的小红书";
  old.edits.moments =
    "这张 M87 图像里，最亮的部分是一圈不对称的辐射环。事件视界望远镜测得它的角直径为 42 ± 3 微角秒，环内的亮度明显下降。论文里可以看到研究团队如何描述这个形态。\n\n原文：https://doi.org/10.3847/2041-8213/ab0ec7";
  const next = readSavedPaper(old);
  expect(next.edits.red).toBe(old.edits.red);
  const offline: Paper = {
    ...next,
    sample: false,
    voice: "author",
    localChannels: ["wechat"],
  };
  expect(channelVoice(offline, "wechat")).toBeUndefined();
  expect(channelCopy(offline, "wechat")).toContain(old.evidence[0].line);
  expect(next.edits.moments).toBe(exampleCopy.moments);
});
