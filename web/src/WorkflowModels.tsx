import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { studioFetch } from "./studio-api";
import {
  chooseWorkflowModel,
  modelTasks,
  workflowChoices,
  type ModelTask,
} from "./workflow-models";
import "./workflow-models.css";

type Catalog = {
  models: { id: string; name: string; roles: string[] }[];
  defaults: Record<string, string>;
};
const contexts = {
  paper: ["reading", "layout", "writing", "rewrite", "paperArt"],
  campaign: ["campaign", "campaignArt", "campaignReview"],
  assistant: ["assistant"],
  rewrite: ["rewrite"],
  writing: ["writing"],
  review: ["campaignReview"],
} satisfies Record<string, ModelTask[]>;

export function useWorkflowChoices() {
  const [choices, setChoices] = useState(workflowChoices);
  useEffect(() => {
    const update = () => setChoices(workflowChoices());
    window.addEventListener("posterlab-workflow-model", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("posterlab-workflow-model", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return choices;
}

export default function WorkflowModels({
  context,
  disabled = false,
}: {
  context: keyof typeof contexts;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>();
  const [failed, setFailed] = useState(false);
  const choices = useWorkflowChoices();
  useEffect(() => {
    if (!open || catalog) return;
    const controller = new AbortController();
    setFailed(false);
    studioFetch("/models", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!Array.isArray(data.models) || !data.defaults) throw Error();
        if (!controller.signal.aborted) setCatalog(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [open, catalog]);
  return (
    <details
      className="workflow-models"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <SlidersHorizontal size={16} aria-hidden />
        模型设置
      </summary>
      {open &&
        (catalog ? (
          <div className="workflow-model-grid">
            {contexts[context].map((task) => {
              const [label, role] = modelTasks[task];
              const options = catalog.models.filter((m) =>
                m.roles.includes(role),
              );
              if (!catalog.defaults[role] || !options.length) return null;
              const chosen = choices[task] || "";
              return (
                <label key={task}>
                  {label}
                  <select
                    aria-label={label}
                    value={chosen}
                    disabled={disabled}
                    onChange={(e) => chooseWorkflowModel(task, e.target.value)}
                  >
                    <option value="">
                      服务默认 · {catalog.defaults[role]}
                    </option>
                    {chosen && !options.some((m) => m.id === chosen) && (
                      <option value={chosen} disabled>
                        {chosen} · 暂不可用
                      </option>
                    )}
                    {options.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : (
          <p role="status">
            {failed
              ? "未能读取模型清单，收起后重新打开可重试。"
              : "正在读取可用模型…"}
          </p>
        ))}
    </details>
  );
}
