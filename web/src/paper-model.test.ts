import { describe, it, expect } from "vitest";
import twitterText from "twitter-text";
import {
  channelCopy,
  wordingToReview,
  createPaper,
  evidenceText,
  examplePaper,
  prepareText,
  publicationVoice,
  recoverPaper,
  threadPosts,
  updateBibliography,
} from "./paper-model";
describe("论文宣传", () => {
  it("校对书目只更新系统附上的出处，保留手写正文和核对原句", () => {
    const p = examplePaper();
    p.title = "LM: P";
    p.source = "https://example.org/old";
    p.byline = "";
    p.edits = {
      x: "1/2 A custom opening.\n\n2/2 " + p.source,
      red: "LM: P 是我的手写正文。\n\n原文：" + p.source,
      moments: "我手工排的出处：" + p.source,
      wechat: "原稿中引用了 LM: P。\n\nLM: P\n" + p.source,
    };
    p.evidenceIds = { wechat: [1] };
    const next = updateBibliography(p, {
      title: "PonderLM",
      byline: "Boyi Zeng et al.",
      source: "https://example.org/new",
    });
    expect(next.edits).toEqual({
      x: "1/2 A custom opening.\n\n2/2 https://example.org/new",
      red: "LM: P 是我的手写正文。\n\n原文：https://example.org/new",
      moments: p.edits.moments,
      wechat:
        "原稿中引用了 LM: P。\n\nPonderLM\nBoyi Zeng et al.\nhttps://example.org/new",
    });
    expect(updateBibliography(next, { ...next, source: "" }).edits.x).toBe(
      "1/1 A custom opening.",
    );
    expect(next.evidenceIds).toEqual({ wechat: [1] });
    expect(evidenceText(next)).toContain("PonderLM\n\nBoyi Zeng et al.");
    expect(p.title).toBe("LM: P");
  });
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

  it("小红书稿件标记未经原文支持的录用、数值和比较方向", () => {
    const p = examplePaper();
    p.title = "PonderLM";
    p.byline = "ICLR 2026";
    p.sections = {
      abstract:
        "2.8B surpasses Pythia-6.9B and approaches Pythia-12B on nine benchmarks.",
      introduction: "",
    };
    p.edits.red = "ICLR 2026 Spotlight：超过 Pythia-12B，提升 67%。";
    expect(wordingToReview(p, "red")).toEqual([
      "Spotlight",
      "67%",
      "超过 Pythia-12B",
    ]);
    p.edits.red = "ICLR 2026：九项测试中，2.8B 接近 Pythia-12B。";
    expect(wordingToReview(p, "red")).toEqual([]);
  });
  it("attributes research to its authors before formatting model-written posts", () => {
    expect(
      publicationVoice(
        "We propose PonderLM.\nOur 2.8B PonderPythia rivals the larger model.",
      ),
    ).toBe(
      "The authors propose PonderLM.\nThe authors’ 2.8B PonderPythia rivals the larger model.",
    );
    expect(publicationVoice("我们在九项任务中验证了方法。")).toBe(
      "研究团队在九项任务中验证了方法。",
    );
    expect(publicationVoice("The paper asks “We study what?”")).toBe(
      "The paper asks “We study what?”",
    );
  });
  it("calls out an invented author voice and unmeasured compute savings", () => {
    const paper = examplePaper();
    paper.model = "StepFun";
    paper.sections = {
      abstract:
        "Under the same computational budget the model achieved a lower loss.",
      introduction: "",
    };
    paper.edits.moments = "我们提出新的方法，算力还省了。";
    expect(wordingToReview(paper, "moments")).toEqual([
      "我们提出",
      "算力还省了",
    ]);
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

it("selects complete, verbatim abstract evidence without an interrupted two-page introduction", () => {
  const abstract =
    "We compare two decoder models. On 9 benchmarks, PonderPythia-2.8B surpasses Pythia-6.9B and rivals Pythia-12B. We use Fig. 2 and Eq. 3. The mean was 1.3 ± 0.2 mm (p = 0.05).";
  const intro =
    "Earlier work considered these methods. Furthermore the models achieve";
  const p = createPaper(
    abstract + "\n\n" + intro,
    "PonderLM",
    "",
    "",
    abstract,
  );
  expect(p.body).toContain("Furthermore the models achieve");
  const quotes = p.evidence.map((e) => e.quote);
  expect(quotes).toContain(
    "On 9 benchmarks, PonderPythia-2.8B surpasses Pythia-6.9B and rivals Pythia-12B.",
  );
  expect(quotes).toContain("We use Fig. 2 and Eq. 3.");
  expect(quotes).toContain("The mean was 1.3 ± 0.2 mm (p = 0.05).");
  expect(quotes.every((q) => abstract.includes(q) && p.body.includes(q))).toBe(
    true,
  );
  const limited = createPaper(intro, "Title", "");
  expect(limited.evidence.map((e) => e.quote)).toEqual([
    "Earlier work considered these methods.",
  ]);
});
