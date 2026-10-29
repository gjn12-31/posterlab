import { openDB } from "idb";
import { type Project, projectSchema, migrateLegacy } from "./model";
const db = openDB("posterlab-studio", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
    db.createObjectStore("settings");
  },
});
export async function listProjects(): Promise<Project[]> {
  const rows = await (await db).getAll("projects");
  return rows
    .flatMap((x) => {
      const r = projectSchema.safeParse(x);
      return r.success ? [r.data] : [];
    })
    .sort((a, b) => b.updated.localeCompare(a.updated));
}
export async function saveProject(p: Project) {
  await (await db).put("projects", projectSchema.parse(p));
}
export async function setting(key: string, value?: unknown) {
  const d = await db;
  if (value !== undefined) return d.put("settings", value, key);
  return d.get("settings", key);
}
export async function migrate() {
  const d = await db;
  if (await d.get("settings", "legacyImported")) return 0;
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem("posterlab.works.v1") || "[]");
  } catch {
    return 0;
  }
  const projects = migrateLegacy(raw);
  for (const p of projects)
    if (!(await d.get("projects", p.id))) await d.put("projects", p);
  await d.put("settings", true, "legacyImported");
  return projects.length;
}
