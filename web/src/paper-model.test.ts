import { describe, it, expect } from "vitest";
import twitterText from "twitter-text";
import {
  channelCopy,
  wordingToReview,
  createPaper,
  evidenceText,
  examplePaper,
  prepareText,
  recoverPaper,
  threadPosts,
} from "./paper-model";
describe("科研传播", () => {
  it("标出所引原句缺少依据的首次、确定性和比较措辞", () => {
    const paper = examplePaper();
    paper.edits.red = "首次拍到，通量比超过10:1，结果完全吻合。";
    expect(wordingToReview(paper, "red")).toEqual([
      "首次",
      "完全吻合",
      "超过10:1",
    ]);
    paper.edits.red = "亮环的角直径为 42 ± 3 微角秒，与理论预期一致。";
    expect(wordingToReview(paper, "red")).toEqual([]);
  });

  it("从有标签的摘要分离出标题、引文与原文链接", () => {
    const d = prepareText(
      "城市步行与树荫\nDOI: 10.1234/walk\n摘要：研究团队记录了树荫与步行路径的关系。观察结果仅限于夏季。\n关键词：树荫\n引言\n其他论文的内容。",
    );
    expect(d.title).toBe("城市步行与树荫");
    expect(d.source).toBe("https://doi.org/10.1234/walk");
    expect(d.body).toContain("仅限于夏季");
    expect(d.body).not.toContain("关键词");
    const p = createPaper(d.body, d.title, d.source);
    expect(p.evidence.every((e) => p.body.includes(e.quote))).toBe(true);
    expect(channelCopy(p, "wechat")).toContain("仅限于夏季");
  });
  it("期刊无标签摘要不混入作者与正文", () => {
    const d = prepareText(
      "Journal header\nLee et al.\n(Received 12 March 2019; published 4 April 2019)\nWe observed the same pattern on two nights.\nDOI: 10.1234/night\nI. INTRODUCTION\nBackground only.",
      "Two nights",
    );
    expect(d).toEqual({
      title: "Two nights",
      body: "We observed the same pattern on two nights.",
      source: "https://doi.org/10.1234/night",
    });
  });
  it("纯摘要与参考文献 DOI 分开", () => {
    const d = prepareText(
      "Abstract\nWe examined a narrow valley in spring.\nReferences\nDOI: 10.1234/other",
    );
    expect(d.title).toBe("");
    expect(d.source).toBe("");
    expect(d.body).not.toContain("References");
  });
  it("中文、长单词与链接按 X 的加权长度分帖", () => {
    const url = "https://example.com/" + "a".repeat(300);
    const posts = threadPosts(["文本🌿".repeat(180), "abc".repeat(250), url]);
    expect(posts.length).toBeGreaterThan(4);
    expect(posts.at(-1)).toContain(url);
    expect(
      posts.every((s) => twitterText.parseTweet(s).weightedLength <= 280),
    ).toBe(true);
  });
  it("平台文案编辑隔离并保留原句来源", () => {
    const p = examplePaper();
    p.edits.red = "作者校订的笔记";
    expect(channelCopy(p, "red")).toBe(p.edits.red);
    expect(channelCopy(p, "moments")).not.toContain("校订");
    expect(recoverPaper(JSON.stringify(p))).toEqual(p);
    expect(evidenceText(p)).toContain(p.evidence[0].quote);
    expect(() =>
      createPaper(
        "我们比较了四个点位的夏季地表温度，以了解它们的分布。",
        "夏季地表",
        "javascript:alert(1)",
      ),
    ).toThrow("原文链接");
  });
});
