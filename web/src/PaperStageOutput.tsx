import { useId, useState } from "react";
import { channels, platforms, type Channel, type Paper } from "./paper-model";
import type { Stage } from "./paper-process-model";

export default function PaperStageOutput({
  paper,
  stage,
}: {
  paper: Paper;
  stage: Stage;
}) {
  const [channel, setChannel] = useState<Channel>("red");
  const group = useId();
  const process = paper.process!;
  const entry = process.stages[stage];
  const analysis = process.analysis;
  const plan = process.plan?.layout;
  const visuals = paper.visuals || [];
  const selected = analysis
    ? [analysis.methodFigureId, analysis.resultTableId].flatMap((id) =>
        visuals.filter((v) => v.id === id),
      )
    : [];
  if (stage === "source" || (stage === "read" && selected.length > 0)) {
    const shown = stage === "source" ? visuals : selected;
    return (
      <div className="pp-proof">
        <strong>
          {stage === "source" ? "从原文裁取的候选图表" : "用于海报的原论文图表"}
        </strong>
        {shown.length ? (
          <div className="pp-visuals">
            {shown.map((v) => (
              <figure key={v.id}>
                <img
                  loading="lazy"
                  src={v.data}
                  alt={v.label + " 原论文裁图"}
                />
                <figcaption>
                  {v.label} · 第 {v.page} 页
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p>
            {process.source === "text"
              ? "本次使用手动输入的文字材料。"
              : "正文已读取。在编辑器中可以手动补入图表。"}
          </p>
        )}
        {stage === "read" && analysis?.selectionNotes?.methodFigure && (
          <p>{analysis.selectionNotes.methodFigure}</p>
        )}
      </div>
    );
  }
  if (stage === "read" && analysis) {
    return (
      <div className="pp-proof">
        <strong>研读结论</strong>
        <p>
          {analysis.reading.result.text ||
            analysis.reading.method.text ||
            analysis.reading.problem.text}
        </p>
      </div>
    );
  }
  if (stage === "layout" && plan) {
    return (
      <div className="pp-proof">
        <strong>模型版式草图</strong>
        <div className="pp-wireframe" data-accent={plan.accent}>
          <div>{plan.title}</div>
          <p>{plan.subtitle}</p>
          <section>
            {plan.blocks
              .slice()
              .sort((a, b) => {
                const order =
                  plan.composition === "results-first"
                    ? ["problem", "result", "method"]
                    : ["problem", "method", "result"];
                return order.indexOf(a.role) - order.indexOf(b.role);
              })
              .map((block) => (
                <span key={block.role}>{block.heading}</span>
              ))}
          </section>
        </div>
      </div>
    );
  }
  if (stage === "copy" && Object.keys(paper.edits).length) {
    return (
      <div className="pp-proof">
        <div className="pp-proof-head">
          <strong>发布稿节选</strong>
          <label htmlFor={group}>
            平台{" "}
            <select
              id={group}
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {platforms[c].name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="pp-copy-excerpt" lang={channel === "x" ? "en" : "zh-CN"}>
          {paper.edits[channel]
            ?.split(/\n\s*\n/)
            .slice(0, 2)
            .join("\n\n") || "此平台的模型稿尚未返回。"}
        </p>
      </div>
    );
  }
  if (stage === "art" && paper.artwork) {
    return (
      <figure className="pp-proof pp-concept">
        <img src={paper.artwork.data} alt="模型为本篇论文生成的概念配图" />
        <figcaption>
          <strong>概念配图</strong>
          <p>{paper.artwork.model}</p>
        </figcaption>
      </figure>
    );
  }
  if (stage === "compile" && paper.posterLayouts) {
    return (
      <div className="pp-proof">
        <strong>可编辑画布</strong>
        <div className="pp-canvas-list">
          {channels.map((c) => {
            const info = platforms[c],
              layout = paper.posterLayouts?.[c];
            if (!layout) return null;
            return (
              <div key={c}>
                <div
                  className="pp-canvas-sample"
                  aria-hidden="true"
                  style={{ aspectRatio: info.width / info.height }}
                >
                  {layout.objects.map((o) => (
                    <i
                      key={o.id}
                      data-image={o.type === "image"}
                      style={{
                        left: o.x * 100 + "%",
                        top: o.y * 100 + "%",
                        width: o.w * 100 + "%",
                        height: o.h * 100 + "%",
                      }}
                    />
                  ))}
                </div>
                <b>{info.name}</b>
                <small>
                  {info.width} × {info.height} · {layout.objects.length} 个图层
                </small>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="pp-proof">
      <p>{entry?.detail || "本步骤完成后，在这里查看实际产出。"}</p>
    </div>
  );
}
