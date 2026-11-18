import { it, expect } from "vitest";
import {
  persistTrace,
  restoreTrace,
  type CampaignTrace,
} from "./campaign-trace";
it("retains only this project's real outputs and marks interrupted requests as unconfirmed", () => {
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const trace: CampaignTrace = {
    id: "one",
    title: "蓝晒",
    steps: [
      { id: "copy", state: "done", source: "writer", detail: "邀请已写好" },
      { id: "artwork", state: "working", source: "image", detail: "" },
    ],
  };
  persistTrace(trace, storage);
  expect(restoreTrace("one", storage).steps[0]).toEqual(trace.steps[0]);
  expect(restoreTrace("one", storage).steps[1].state).toBe("interrupted");
  expect(restoreTrace("two", storage).steps).toEqual([]);
});
