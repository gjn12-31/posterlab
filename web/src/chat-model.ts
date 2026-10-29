export type Job = {
  id: string;
  state:
    "queued" | "designing" | "checking" | "rendering" | "complete" | "failed";
  created: string;
  brief: string;
  style: string;
  style_name: string;
  format: string;
  instruction: string;
  revision_of?: string;
  revision_mode?: string;
  design_plan?: string;
  changes?: string[];
  reference_image_used?: boolean;
  visual_delta?: { changed_pixel_percent: number; meaning: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  asset_ids?: string[];
  image_url?: string;
  summary?: string;
  error?: string;
  can_rerender?: boolean;
  model: string;
  cost?: number | null;
  provider_response_id?: string;
  preset_prompt: string;
  report?: { width: number; height: number; renderer: string };
};
export type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  jobId?: string;
};
export type Conversation = {
  id: string;
  title: string;
  messages: Turn[];
  created: string;
  updated: string;
};
export function titleFrom(text: string) {
  const title = text.match(
    /(?:^|\n)\s*(?:标题|活动标题|主题)[：:]\s*(.+)/,
  )?.[1];
  return (title || text).replace(/\s+/g, " ").slice(0, 24) || "新对话";
}
export function historyFor(messages: Turn[]) {
  // Keep the initial brief and recent exchanges; current canvas facts travel separately.
  const recent =
    messages.length <= 16 ? messages : [messages[0], ...messages.slice(-15)];
  return recent.map(({ role, content }) => ({ role, content }));
}
export function importLegacy(jobs: Job[]): Conversation[] {
  const map = new Map(jobs.map((j) => [j.id, j]));
  const groups = new Map<string, Job[]>();
  for (const job of [...jobs].reverse()) {
    let root = job;
    const seen = new Set([root.id]);
    while (
      root.revision_of &&
      map.has(root.revision_of) &&
      !seen.has(root.revision_of)
    ) {
      root = map.get(root.revision_of)!;
      seen.add(root.id);
    }
    groups.set(root.id, [...(groups.get(root.id) || []), job]);
  }
  return [...groups].map(([id, group]) => ({
    id: "legacy-" + id,
    title: titleFrom(group[0].brief.replace(/^标题[：:]\s*/, "")),
    created: group[0].created,
    updated: group.at(-1)!.created,
    messages: group.flatMap((j) => [
      {
        id: j.id + "-u",
        role: "user" as const,
        content: j.instruction || j.brief,
      },
      {
        id: j.id + "-a",
        role: "assistant" as const,
        content: j.summary || "这是之前的创作记录。",
        jobId: j.id,
      },
    ]),
  }));
}
