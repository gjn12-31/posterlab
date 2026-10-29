import { expect, it } from "vitest";
import { demoResponse } from "./studio-api";
it("static demo exposes recorded results without fabricating API success", async () => {
  const routes = { "/generations": [{ id: "recorded" }] };
  expect(await demoResponse(routes, "/generations").json()).toEqual([
    { id: "recorded" },
  ]);
  const denied = demoResponse(routes, "/generations", "POST");
  expect(denied.status).toBe(503);
  expect((await denied.json()).detail).toContain("展示模式");
  expect(demoResponse(routes, "/unknown").status).toBe(404);
});
it("recorded reviews remain scoped to their actual model", async () => {
  const routes = {
    "/evaluations/for/example": { id: "review", model: "step-5-preview" },
  };
  expect(
    await demoResponse(
      routes,
      "/evaluations/for/example?model=step-3.7-flash",
    ).json(),
  ).toBeNull();
  expect(
    (
      await demoResponse(
        routes,
        "/evaluations/for/example?model=step-5-preview",
      ).json()
    ).id,
  ).toBe("review");
});
