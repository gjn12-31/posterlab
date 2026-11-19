import { workspaceKey } from "./workspace";

export const modelTasks = {
  reading: ["论文研读", "paper"],
  layout: ["海报版式", "paper"],
  writing: ["四平台文案", "paper"],
  rewrite: ["单平台改写", "paper"],
  paperArt: ["论文概念配图", "artwork"],
  campaign: ["活动策划与邀请", "campaign"],
  campaignArt: ["活动主视觉", "artwork"],
  campaignReview: ["成图审阅", "review"],
  assistant: ["模板文字助手", "chat"],
} as const;
export type ModelTask = keyof typeof modelTasks;
export type WorkflowChoices = Partial<Record<ModelTask, string>>;
const key = workspaceKey("posterlab.workflow-models.v1");
let inMemory: WorkflowChoices | undefined;
export function workflowChoices(): WorkflowChoices {
  if (inMemory) return inMemory;
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return Object.fromEntries(
      Object.keys(modelTasks)
        .filter((k) => typeof raw?.[k] === "string" && raw[k].length <= 80)
        .map((k) => [k, raw[k]]),
    );
  } catch {
    return {};
  }
}
export function chooseWorkflowModel(task: ModelTask, model: string) {
  const next = { ...workflowChoices(), [task]: model };
  try {
    localStorage.setItem(key, JSON.stringify(next));
    inMemory = undefined;
  } catch {
    inMemory = next;
  }
  window.dispatchEvent(new Event("posterlab-workflow-model"));
}
// An empty choice preserves the service default and the legacy request shape.
export function modelField(model?: string) {
  return model ? { model } : {};
}
