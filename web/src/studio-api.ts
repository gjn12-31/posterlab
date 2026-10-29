/** Pages serves explicit, recorded examples. It never emulates a live model call. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";
export const DEMO_MESSAGE =
  "当前为 GitHub Pages 展示模式。生成、修改与新评测请运行 GitHub 仓库中的本机完整版；此处仅展示提前真实生成的案例。";
export type DemoRoutes = Record<string, unknown>;
let snapshot: Promise<DemoRoutes> | undefined;
export function demoResponse(
  routes: DemoRoutes,
  path: string,
  method = "GET",
): Response {
  if (method !== "GET")
    return Response.json({ detail: DEMO_MESSAGE }, { status: 503 });
  const [pathname, query] = path.split("?");
  if (!(pathname in routes))
    return Response.json({ detail: "展示版未收录此内容" }, { status: 404 });
  let data = routes[pathname];
  if (pathname.startsWith("/evaluations/for/")) {
    const model = new URLSearchParams(query).get("model");
    if (model && (data as { model?: string } | null)?.model !== model)
      data = null;
  }
  return Response.json(data);
}
export async function studioFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!STATIC_DEMO) return fetch("/api" + path, init);
  if (init.method && init.method !== "GET")
    return demoResponse({}, path, init.method);
  snapshot ??= fetch(`${import.meta.env.BASE_URL}demo/manifest.json`)
    .then(async (r) => {
      if (!r.ok) throw Error("展示案例加载失败，请刷新页面");
      return r.json();
    })
    .catch((e) => {
      snapshot = undefined;
      throw e;
    });
  return demoResponse(await snapshot, path);
}
