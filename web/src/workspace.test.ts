import { describe, expect, it } from "vitest";
import { workspaceKey, workspacePrefix, workspaceUrl } from "./workspace";

const image = "/api/generations/item/image";
const draft = "posterlab.paper.v1";

describe("invited workspaces", () => {
  it.each(["/t/lab-a/", "/t/lab-a/app/", "/t/lab-a/app/index.html"])(
    "routes backend URLs and scopes storage at %s",
    (pathname) => {
      expect(workspacePrefix(pathname)).toBe("/t/lab-a");
      for (const url of [
        image,
        "/api/status",
        "/api/generations/item/package",
        "/api/evaluations/for/item?model=m",
      ]) {
        expect(workspaceUrl(url, pathname)).toBe("/t/lab-a" + url);
      }
      for (const key of [
        draft,
        "posterlab-studio",
        "posterlab-paper-library",
        "posterlab.works.v1",
      ]) {
        expect(workspaceKey(key, pathname)).toBe("/t/lab-a:" + key);
        expect(workspaceKey(key, pathname)).not.toBe(
          workspaceKey(key, "/t/lab-b/app/"),
        );
      }
    },
  );
  it.each([
    "/",
    "/app/",
    "/posterlab/",
    "/t/../app/",
    "/t/team%2Fapp/",
    "/t/lab_name/",
  ])("preserves standalone and Pages URLs at %s", (pathname) => {
    expect(workspacePrefix(pathname)).toBe("");
    expect(workspaceUrl(image, pathname)).toBe(image);
    expect(workspaceKey(draft, pathname)).toBe(draft);
  });
  it("keeps packaged example assets, platform links and resolved workspace images intact", () => {
    for (const value of [
      undefined,
      "demo/case.png",
      "https://example.com/paper",
      "data:image/png;base64,AAA=",
      "/t/lab-a" + image,
    ]) {
      expect(workspaceUrl(value, "/t/lab-a/app/")).toBe(value);
    }
  });
});
