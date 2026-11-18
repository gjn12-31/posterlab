import { describe, expect, it } from "vitest";
import { createPaper, examplePaper, recoverPaper } from "./paper-model";
import {
  moveStoryCard,
  paperStory,
  storyIssue,
  storyTexts,
} from "./paper-story-model";

describe("论文图解长帖", () => {
  it("旧稿沿用所选原句，没有研究结果时保留原文摘录", () => {
    const sentence = "All observations took place during summer afternoons.";
    const p = createPaper(sentence, "Field observations", "");
    const loaded = recoverPaper(JSON.stringify(p));
    const cards = paperStory(loaded);
    expect(loaded.story).toBeUndefined();
    expect(cards.map((c) => c.role)).toEqual(["封面", "摘录"]);
    expect(cards[1].body).toBe(sentence);
    expect(storyIssue(loaded)).toBe("");
  });
  it("卡片保留自己的引文，平台换句不会把已编排的卡片指向另一条证据", () => {
    const p = examplePaper();
    const cards = moveStoryCard(paperStory(p), 2, -1);
    p.story = cards.map((c, i) =>
      i === 1 ? { ...c, title: "亮环的大小" } : c,
    );
    p.evidence = [p.evidence[0]];
    const restored = recoverPaper(JSON.stringify(p));
    const text = storyTexts(restored);
    expect(text.caption).toContain("02 / 亮环的大小");
    expect(text.sources).toContain(
      "02 · 发现 · 亮环的大小\n论文原句\nWe have resolved",
    );
    expect(storyIssue(restored)).toBe("");
    restored.story![1].quote = "A sentence outside the paper.";
    expect(storyIssue(restored)).toContain("未在论文正文中找到");
  });
});
