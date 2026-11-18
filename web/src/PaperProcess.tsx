import { useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle } from "lucide-react";
import PaperStageOutput from "./PaperStageOutput";
import { stageLabels, stages, type Stage } from "./paper-process-model";
import type { Paper } from "./paper-model";
import "./paper-process.css";

export default function PaperProcess({
  paper,
  running = false,
  retry,
}: {
  paper: Paper;
  running?: boolean;
  retry?: () => void;
}) {
  const [expanded, setExpanded] = useState(running);
  const [inspected, setInspected] = useState<Stage>();
  const process = paper.process;
  if (!process) return null;
  const analysis = process.analysis;
  const inspectedStage =
    inspected ||
    [...stages].reverse().find((s) => process.stages[s]?.state === "done") ||
    "source";
  const retryable =
    process.live &&
    stages.some(
      (s) =>
        !process.stages[s] ||
        ["failed", "working"].includes(process.stages[s]?.state || ""),
    );
  const completed = stages.filter(
    (s) => process.stages[s]?.state === "done",
  ).length;
  return (
    <section className="pp-run" aria-label="海报制作记录">
      <header>
        <div>
          <h3>海报制作记录</h3>
          <p aria-live="polite">
            {running
              ? "正在制作，可查看每一步的产出"
              : retryable
                ? "已保存可用成果，部分步骤待完成"
                : "已完成"}{" "}
            · {completed} 项已执行
          </p>
        </div>
        {!running && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "收起" : "查看步骤与依据"}
            <ChevronDown size={15} />
          </button>
        )}
      </header>
      {(expanded || running) && (
        <>
          <ol className="pp-stages">
            {stages.map((stage, index) => {
              const entry = process.stages[stage];
              const inProgress = running && entry?.state === "working";
              return (
                <li key={stage} data-state={entry?.state || "pending"}>
                  <button
                    className="pp-stage-pick"
                    type="button"
                    aria-label={"查看" + stageLabels[stage] + "产出"}
                    aria-pressed={stage === inspectedStage}
                    onClick={() => setInspected(stage)}
                  >
                    <span className="pp-stage-content">
                      <span className="pp-indicator">
                        {inProgress ? (
                          <LoaderCircle size={15} className="wx-spin" />
                        ) : entry?.state === "done" ? (
                          <Check size={15} />
                        ) : entry?.state === "failed" ? (
                          <CircleAlert size={15} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="pp-stage-label">
                        <strong>{stageLabels[stage]}</strong>
                        <span className="pp-stage-detail">
                          {entry?.state === "working" && !running
                            ? "上次制作中断，可继续。"
                            : entry?.detail || "等待前一步完成"}
                        </span>
                        {entry?.model && <small>{entry.model}</small>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <PaperStageOutput paper={paper} stage={inspectedStage} />
          {analysis && (
            <details className="pp-reading">
              <summary>查看研究结论与逐条出处</summary>
              {(["problem", "method", "result"] as const).map((k) => {
                const item = analysis.reading[k];
                return (
                  <section key={k}>
                    <h4>
                      {
                        {
                          problem: "研究问题",
                          method: "主要方法",
                          result: "实验结果",
                        }[k]
                      }
                    </h4>
                    <p>{item.text || "所提供的原文未给出可核实的结论。"}</p>
                    {item.refs.map((ref, i) => (
                      <blockquote key={i}>
                        <b>
                          {process.source === "pdf"
                            ? "原文第 " + ref.page + " 页"
                            : "输入材料第 " + ref.page + " 段"}
                        </b>
                        {ref.quote}
                      </blockquote>
                    ))}
                  </section>
                );
              })}
            </details>
          )}
          {process.plan && (
            <p className="pp-order">
              版面安排 ·{" "}
              {process.plan.layout.blocks.map((b) => b.heading).join(" / ")}
            </p>
          )}
        </>
      )}
      {retryable && !running && retry && (
        <button type="button" className="pp-retry" onClick={retry}>
          继续未完成的步骤
        </button>
      )}
    </section>
  );
}
