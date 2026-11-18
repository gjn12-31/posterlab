import { describe, expect, it } from "vitest";
import { campaignLines } from "./campaign-lines";

const graphemes = new Intl.Segmenter("zh", { granularity: "grapheme" });
const width = (s: string) => Array.from(graphemes.segment(s)).length;
describe("campaign line breaking", () => {
  it("keeps punctuation with Chinese words and balances two-line headlines", () => {
    const lines = campaignLines("山野观察，周末集合", 5, width, true);
    expect(lines.join("")).toBe("山野观察，周末集合");
    expect(lines.every((l) => width(l) <= 5 && !/^[，。、）]/u.test(l))).toBe(
      true,
    );
  });
  it("keeps an English word intact when it can fit the column", () => {
    expect(campaignLines("Coffee tasting night", 9, width)).toEqual([
      "Coffee",
      "tasting",
      "night",
    ]);
  });
  it("splits overwide names at whole graphemes without dropping content", () => {
    const name = "A👩🏽‍🚀👨🏻‍🏫BCDEF";
    const lines = campaignLines(name, 3, width);
    expect(lines.join("")).toBe(name);
    expect(lines.every((line) => width(line) <= 3)).toBe(true);
    expect(lines.join("|")).toContain("👩🏽‍🚀");
  });
});
