import { describe, it, expect } from "vitest";
import {
  titleFrom,
  historyFor,
  importLegacy,
  type Job,
  type Turn,
} from "./chat-model";
describe("conversation continuity", () => {
  it("keeps the initial brief plus recent context within the API message limit", () => {
    const messages: Turn[] = Array.from({ length: 31 }, (_, i) => ({
      id: String(i),
      role: i % 2 ? "assistant" : "user",
      content: "message " + i,
    }));
    const history = historyFor(messages);
    expect(history).toHaveLength(16);
    expect(history[0].content).toBe("message 0");
    expect(history.at(-1)?.content).toBe("message 30");
  });
  it("imports previous versions into one conversation without losing failed attempts", () => {
    const base = {
      brief: "标题：设计开放日",
      style: "paper",
      style_name: "杂志编辑",
      format: "portrait",
      instruction: "",
      model: "m",
      preset_prompt: "",
    };
    const jobs: Job[] = [
      {
        ...base,
        id: "b",
        created: "2026-10-29",
        state: "failed",
        revision_of: "a",
      },
      { ...base, id: "a", created: "2026-10-28", state: "complete" },
    ];
    const threads = importLegacy(jobs);
    expect(threads).toHaveLength(1);
    expect(
      threads[0].messages.filter((m) => m.jobId).map((m) => m.jobId),
    ).toEqual(["a", "b"]);
  });
});

it("names a conversation from the actual poster title instead of boilerplate", () => {
  expect(
    titleFrom("请根据以下需求制作海报\n标题：春日咖啡节\n日期：2026-11-01"),
  ).toBe("春日咖啡节");
});

it("recovers missing server jobs after refresh without duplicating local conversations", async () => {
  const { recoverMissingJobs } = await import("./chat-model");
  const base = { brief: "活动主题：设计开放日", style: "free", style_name: "自由创作", format: "portrait", instruction: "", model: "m", preset_prompt: "", created: "2026-10-29" };
  const jobs: Job[] = [{ ...base, id: "b", state: "failed", revision_of: "a" }, { ...base, id: "a", state: "complete" }];
  const original = importLegacy([jobs[1]]).map((t) => ({ ...t, id: "user-conversation" }));
  const recovered = recoverMissingJobs(original, jobs);
  expect(recovered).toHaveLength(1);
  expect(recovered[0].id).toBe("user-conversation");
  expect(recovered[0].messages.filter((m) => m.jobId).map((m) => m.jobId)).toEqual(["a", "b"]);
  expect(recoverMissingJobs(recovered, jobs)).toEqual(recovered);
  expect(recoverMissingJobs(original, [{ ...jobs[0], revision_of: undefined }, jobs[1]])).toHaveLength(2);
  expect(titleFrom(base.brief)).toBe("设计开放日");
});
