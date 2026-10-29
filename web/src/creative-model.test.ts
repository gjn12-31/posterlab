import { describe, it, expect } from "vitest";
import {
  scenes,
  scenePrompt,
  refinePrompt,
  brandContext,
  emptyBrand,
  toggleAsset,
  parseBackup,
  type Asset,
} from "./creative-model";
describe("guided creative workflow", () => {
  it("builds an editable scene brief without inventing missing facts", () => {
    const prompt = scenePrompt(
      scenes[0],
      { 标题: "咖啡开放日", 日期: "", 地点: "梧桐街角" },
      "暖色留白",
    );
    expect(prompt).toContain("标题：咖啡开放日");
    expect(prompt).toContain("地点：梧桐街角");
    expect(prompt).not.toContain("日期：");
    expect(prompt).toContain("不编造");
  });
  it("supports freeform refinement and keeps unchanged facts protected", () => {
    expect(refinePrompt({}, "", "")).toBe("");
    const prompt = refinePrompt(
      { 配色色系: "蓝紫冷色", 留白间距: "" },
      "日期改为11月12日",
      "方图 1080 × 1080",
    );
    expect(prompt).toContain("配色色系：蓝紫冷色");
    expect(prompt).toContain("日期改为11月12日");
    expect(prompt).toContain("保留未明确要求修改");
    expect(prompt).not.toContain("留白间距：");
  });
  it("only applies brand preferences when enabled", () => {
    expect(brandContext({ ...emptyBrand, name: "测试品牌" })).toBe("");
    expect(
      brandContext({ ...emptyBrand, enabled: true, color: "#4F46E5" }),
    ).toContain("品牌色：#4F46E5");
  });
  it("replaces backgrounds, toggles icons, and enforces a six material limit", () => {
    const assets = [
      { id: "a", kind: "background" },
      { id: "b", kind: "background" },
      { id: "c", kind: "icon" },
    ] as Asset[];
    expect(toggleAsset(["a", "c"], assets[1], assets)).toEqual(["c", "b"]);
    expect(toggleAsset(["c"], assets[2], assets)).toEqual([]);
    expect(() =>
      toggleAsset(["1", "2", "3", "4", "5", "6"], assets[2], assets),
    ).toThrow();
  });
  it("accepts a conversation backup and rejects malformed roles and unsafe image references", () => {
    const backup = {
      version: 1,
      conversations: [
        {
          id: "test",
          title: "test",
          created: "2026-10-29T00:00:00Z",
          updated: "2026-10-29T00:00:00Z",
          messages: [{ id: "m", role: "user", content: "hello" }],
        },
      ],
    };
    expect(parseBackup(JSON.stringify(backup))).toHaveLength(1);
    expect(
      parseBackup(
        JSON.stringify(backup).replaceAll(
          "2026-10-29T00:00:00Z",
          "2026-10-29T00:00:00.123456+00:00",
        ),
      ),
    ).toHaveLength(1);
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, version: 2 })),
    ).toThrow();
    expect(() =>
      parseBackup(JSON.stringify(backup).replace('"user"', '"system"')),
    ).toThrow();
    expect(() =>
      parseBackup('{"version":1,"conversations":[{"messages":null}]}'),
    ).toThrow();
  });
});
