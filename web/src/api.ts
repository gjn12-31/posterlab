import { studioFetch } from "./studio-api";
import { type Project, type Suggestion } from "./model";
export async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await studioFetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body
      ? {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw Error("AI 服务尚未启动，仍可使用本地创作功能");
  }
  if (!res.ok)
    throw Error(
      typeof data.detail === "string" ? data.detail : "服务暂时不可用",
    );
  return data;
}
export type Service = {
  ai: boolean;
  mode: string;
  model: string;
  budget: number;
  spent: number;
  reserved: number;
};
export const status = () => request<Service>("/status");
export const aiSuggestion = (p: Project, instruction: string, kind = "edit") =>
  request<Suggestion>("/assist", {
    brief: p.current.brief,
    locked: p.current.locked,
    theme: p.current.theme,
    titleScale: p.current.titleScale,
    instruction,
    kind,
  });
