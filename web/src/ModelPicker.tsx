export type ModelRole = "chat" | "design" | "review";
export type ModelPreferences = Record<ModelRole, string>;
export type ModelCatalog = {
  models: {
    id: string;
    name: string;
    description: string;
    roles: ModelRole[];
  }[];
  defaults: ModelPreferences;
};
export const defaultPreferences: ModelPreferences = {
  chat: "",
  design: "",
  review: "",
};
export function ModelPicker({
  catalog,
  value,
  onChange,
}: {
  catalog: ModelCatalog | null;
  value: ModelPreferences;
  onChange: (value: ModelPreferences) => void;
}) {
  return (
    <section className="model-settings" aria-label="AI 模型选择">
      <h3>选择你的 AI 搭档</h3>
      <p className="dialog-copy">
        分别决定谁整理需求、谁设计、谁评测。选择保存在此浏览器，下一次请求生效。
      </p>
      {(
        [
          ["chat", "需求助手与对话"],
          ["design", "海报生成与修改"],
          ["review", "海报视觉评测"],
        ] as const
      ).map(([role, label]) => {
        const selected = value[role] || catalog?.defaults[role];
        const entry = catalog?.models.find((m) => m.id === selected);
        return (
          <label className="option-label" key={role}>
            {label}
            <select
              aria-label={label}
              disabled={!catalog}
              value={value[role]}
              onChange={(e) => onChange({ ...value, [role]: e.target.value })}
            >
              <option value="">
                服务默认
                {catalog ? ` · ${catalog.defaults[role]}` : " · 正在读取"}
              </option>
              {catalog?.models
                .filter((m) => m.roles.includes(role))
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <small>{entry?.description || "读取模型信息后可选择"}</small>
          </label>
        );
      })}
      <p className="dialog-copy">
        评测仅支持看图模型。切换评测模型后单独计分；新调用按平台计费，权限和余额以你的账号为准，不会自动换用其他模型。
      </p>
    </section>
  );
}
