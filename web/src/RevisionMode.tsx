export type RevisionMode = "polish" | "redesign" | "reimagine";
export const revisionLabels = {
  polish: "精细调整",
  redesign: "明显改版",
  reimagine: "全新方案",
};
export function RevisionModePicker({
  value,
  onChange,
}: {
  value: RevisionMode;
  onChange: (mode: RevisionMode) => void;
}) {
  return (
    <fieldset className="revision-picker">
      <legend>这次想改多少？</legend>
      <div>
        {(Object.keys(revisionLabels) as RevisionMode[]).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={value === mode}
            onClick={() => onChange(mode)}
          >
            {revisionLabels[mode]}
          </button>
        ))}
      </div>
      <p>
        {value === "polish"
          ? "保留构图，精准修改指定细节。"
          : value === "redesign"
            ? "允许重构布局、字体和主视觉，让变化清楚可见。"
            : "保留事实，从新的艺术方向重新设计整张海报。"}
      </p>
    </fieldset>
  );
}
