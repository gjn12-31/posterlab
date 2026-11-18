import { workspaceKey } from "./workspace";
export const stepNames = {
  notice: "读取活动通知",
  copy: "撰写邀请与主视觉简报",
  layout: "编排三种画幅",
  artwork: "绘制活动主视觉",
  apply: "应用图片到可编辑画布",
  review: "审阅当前画幅",
} as const;
export const stepStatus = {
  working: "进行中",
  done: "完成",
  failed: "未完成",
  interrupted: "待核对",
} as const;
export type CampaignStep = {
  id: keyof typeof stepNames;
  state: keyof typeof stepStatus;
  source: string;
  detail: string;
};
export type CampaignTrace = {
  id: string;
  title: string;
  steps: CampaignStep[];
};
const key = (id: string) => workspaceKey("posterlab.campaign.trace.v1/" + id);

export function restoreTrace(
  id: string,
  storage?: Pick<Storage, "getItem">,
): CampaignTrace {
  const empty: CampaignTrace = { id, title: "", steps: [] };
  try {
    const saved = JSON.parse((storage ?? window.localStorage).getItem(key(id)) || "null");
    if (
      !saved ||
      saved.id !== id ||
      typeof saved.title !== "string" ||
      !Array.isArray(saved.steps)
    )
      return empty;
    const steps: CampaignStep[] = [];
    for (const step of saved.steps.slice(-6)) {
      if (
        !step ||
        !Object.hasOwn(stepNames, step.id) ||
        !Object.hasOwn(stepStatus, step.state) ||
        typeof step.source !== "string" ||
        typeof step.detail !== "string"
      )
        continue;
      steps.push(
        step.state === "working"
          ? {
              ...step,
              state: "interrupted",
              detail: "页面已离开，尚未收到这个步骤的最终结果。",
            }
          : step,
      );
    }
    return { id, title: saved.title, steps };
  } catch {
    return empty;
  }
}
export function persistTrace(
  trace: CampaignTrace,
  storage?: Pick<Storage, "setItem">,
) {
  if (!trace.id || !trace.steps.length) return;
  try {
    (storage ?? window.localStorage).setItem(key(trace.id), JSON.stringify(trace));
  } catch {
    /* The visible record remains available in memory. */
  }
}
