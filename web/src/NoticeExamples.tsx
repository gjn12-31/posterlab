import { useState } from "react";
import { Check, ChevronDown, Copy, CornerDownLeft } from "lucide-react";
import { campaigns } from "./campaign-model";

export default function NoticeExamples({
  choose,
  busy,
}: {
  choose: (text: string) => void;
  busy: boolean;
}) {
  const [active, select] = useState(0);
  const [feedback, setFeedback] = useState("");
  const sample = campaigns[active];
  return (
    <details className="notice-examples">
      <summary>
        <span>
          活动通知示例 <small>{campaigns.length} 份</small>
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="notice-examples-body">
        <div
          className="notice-options"
          role="group"
          aria-label="选择活动通知示例"
        >
          {campaigns.map((item, i) => (
            <button
              key={item.edition}
              type="button"
              aria-pressed={i === active}
              onClick={() => {
                select(i);
                setFeedback("");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="notice-text">{sample.notice}</p>
        <div className="notice-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              choose(sample.notice);
              setFeedback("已填入上方的活动通知");
            }}
          >
            <CornerDownLeft size={15} />
            填入通知
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(sample.notice);
                setFeedback("已复制示例文案");
              } catch {
                setFeedback("可选中上方完整通知复制，或点「填入通知」");
              }
            }}
          >
            {feedback === "已复制示例文案" ? (
              <Check size={14} />
            ) : (
              <Copy size={14} />
            )}
            复制文案
          </button>
        </div>
        <span className="notice-feedback" role="status">
          {feedback}
        </span>
      </div>
    </details>
  );
}
