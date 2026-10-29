import { studioFetch, STATIC_DEMO, DEMO_MESSAGE } from "./studio-api";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  Eye,
  LoaderCircle,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { RevisionModePicker, type RevisionMode } from "./RevisionMode";
import type { Job } from "./chat-model";
export type Metric = {
  id: string;
  name: string;
  weight: number;
  score: number;
  evidence: string;
  suggestion: string;
};
export type Review = {
  id: string;
  generation_id: string;
  state: "evaluating" | "complete" | "failed";
  model: string;
  rubric_version: string;
  created: string;
  error?: string;
  report?: {
    overall: number;
    summary: string;
    strengths: string[];
    dimensions: Metric[];
  };
};
async function call<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const r = await studioFetch(path, {
    method: body ? "POST" : "GET",
    headers: body
      ? { "Content-Type": "application/json", "Idempotency-Key": key! }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(
      typeof data.detail === "string"
        ? data.detail
        : "请求未完成，请检查输入或稍后重试。",
    );
  return data;
}
export function radarPoints(metrics: Metric[], radius = 96) {
  return metrics
    .map((m, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 3,
        r = (radius * m.score) / 100;
      return `${160 + Math.cos(a) * r},${140 + Math.sin(a) * r}`;
    })
    .join(" ");
}
function Radar({ metrics }: { metrics: Metric[] }) {
  return (
    <svg
      className="review-radar"
      viewBox="0 0 320 280"
      role="img"
      aria-label={
        "六维评分：" + metrics.map((m) => `${m.name}${m.score}分`).join("，")
      }
    >
      <defs>
        <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#a6f4d2" stopOpacity=".48" />
          <stop offset="1" stopColor="#9289ed" stopOpacity=".13" />
        </linearGradient>
      </defs>
      {[25, 50, 75, 100].map((n) => (
        <polygon
          key={n}
          points={radarPoints(metrics.map((m) => ({ ...m, score: n })))}
          fill="none"
          stroke="#ffffff15"
        />
      ))}
      {metrics.map((m, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        return (
          <g key={m.id}>
            <line
              x1="160"
              y1="140"
              x2={160 + 96 * Math.cos(a)}
              y2={140 + 96 * Math.sin(a)}
              stroke="#ffffff12"
            />
            <text
              x={160 + 129 * Math.cos(a)}
              y={144 + 119 * Math.sin(a)}
              textAnchor="middle"
              fill="#b6bfca"
              fontSize="10"
            >
              {m.name}
            </text>
          </g>
        );
      })}
      <polygon
        points={radarPoints(metrics)}
        fill="url(#radar-fill)"
        stroke="#a6eacb"
        strokeWidth="2"
      />
      {metrics.map((m, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        return (
          <circle
            key={m.id}
            cx={160 + ((96 * m.score) / 100) * Math.cos(a)}
            cy={140 + ((96 * m.score) / 100) * Math.sin(a)}
            r="3"
            fill="#d8ffe9"
          />
        );
      })}
    </svg>
  );
}
export function EvaluationPanel({
  reviewModel,
  designModel,
  job,
  busy,
  onJob,
  onSaved,
}: {
  reviewModel: string;
  designModel?: string;
  job: Job;
  busy: boolean;
  onJob: (job: Job, text: string) => void;
  onSaved: (review: Review) => void;
}) {
  const [review, setReview] = useState<Review | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [applying, setApplying] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [note, setNote] = useState("");
  const [revisionMode, setRevisionMode] = useState<RevisionMode>("redesign");
  const [rubric, setRubric] = useState<{
    model: string;
    dimensions: { id: string; name: string; weight: number; prompt: string }[];
  } | null>(null);
  const lock = useRef(false),
    initialized = useRef("");
  const [previous, setPrevious] = useState<Review | null>(null);
  function accept(r: Review | null) {
    setReview(r);
    if (r?.state === "complete") {
      onSaved(r);
      if (initialized.current !== r.id) {
        initialized.current = r.id;
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("posterlab.review.draft." + r.id) || "null",
          );
          if (
            saved &&
            Array.isArray(saved.selected) &&
            typeof saved.note === "string"
          ) {
            setSelected(
              saved.selected.filter((id: string) =>
                r.report!.dimensions.some((m) => m.id === id),
              ),
            );
            setNote(saved.note);
            if (
              ["polish", "redesign", "reimagine"].includes(saved.revisionMode)
            )
              setRevisionMode(saved.revisionMode);
            return;
          }
        } catch {}
        setSelected(
          r
            .report!.dimensions.filter((m) => m.score < 85)
            .sort((a, b) => a.score - b.score)
            .slice(0, 3)
            .map((m) => m.id),
        );
      }
    }
  }
  useEffect(() => {
    if (review?.state !== "complete") return;
    try {
      sessionStorage.setItem(
        "posterlab.review.draft." + review.id,
        JSON.stringify({ selected, note, revisionMode }),
      );
    } catch {}
  }, [review?.id, review?.state, selected, note, revisionMode]);
  useEffect(() => {
    let stopped = false;
    Promise.all([
      call<Review | null>(
        "/evaluations/for/" +
          job.id +
          "?model=" +
          encodeURIComponent(reviewModel),
      ),
      call<typeof rubric>("/evaluation-rubric"),
      job.revision_of
        ? call<Review | null>(
            "/evaluations/for/" +
              job.revision_of +
              "?model=" +
              encodeURIComponent(reviewModel),
          )
        : Promise.resolve(null),
    ])
      .then(([r, s, p]) => {
        if (!stopped) {
          accept(r);
          setRubric(s);
          setPrevious(p);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!stopped) {
          setError("暂时无法读取评测，请关闭后重新打开。");
          setLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
  }, [job.id, reviewModel]);
  useEffect(() => {
    if (review?.state !== "evaluating") return;
    let stopped = false;
    const timer = setInterval(() => {
      call<Review>("/evaluations/" + review.id)
        .then((r) => {
          if (!stopped) {
            accept(r);
            setError("");
          }
        })
        .catch(() => {
          if (!stopped)
            setError("连接暂时中断，正在恢复评测状态；不会重复提交。");
        });
    }, 1800);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [review?.id, review?.state]);
  async function start() {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError("");
    try {
      accept(
        await call<Review>(
          "/evaluations",
          { generation_id: job.id, model: reviewModel },
          crypto.randomUUID(),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }
  async function apply() {
    if (lock.current || !review || !selected.length) return;
    lock.current = true;
    setApplying(true);
    setError("");
    const body = {
      dimension_ids: selected,
      note,
      revision_mode: revisionMode,
      design_model: designModel,
    };
    const fingerprint = JSON.stringify(body),
      storageKey = "posterlab.review.apply." + review.id;
    let key = crypto.randomUUID();
    try {
      const old = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (old?.fingerprint === fingerprint) key = old.key;
      sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
    } catch {}
    try {
      const j = await call<Job>(
        "/evaluations/" + review.id + "/apply",
        body,
        key,
      );
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      onJob(
        j,
        "根据海报评测优化：" +
          review
            .report!.dimensions.filter((m) => selected.includes(m.id))
            .map((m) => m.name)
            .join("、") +
          (note ? "。" + note : ""),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setApplying(false);
    }
  }
  const report = review?.report;
  const delta =
    report && previous?.report
      ? Math.round((report.overall - previous.report.overall) * 10) / 10
      : null;
  return (
    <div className="review-panel">
      {STATIC_DEMO && (
        <p className="dialog-copy">
          公开彩排的真实评测记录，非实时评分。生成新版请运行本机完整版。
        </p>
      )}
      {error && (
        <p className="tool-error" role="alert">
          {error}
        </p>
      )}
      {!report ? (
        <div className="review-start">
          <div className="review-poster">
            <img src={job.image_url} alt="待评测海报" />
            {(loading || review?.state === "evaluating") && (
              <div className="scan-line" />
            )}
          </div>
          <div className="review-start-copy">
            <span className="eyebrow">A SECOND PAIR OF EYES</span>
            <h3>
              让好设计，
              <br />
              再进一步。
            </h3>
            <p>
              AI
              会查看这张真实海报，对照你的需求给出六维评分、具体依据和可执行的改进建议。
            </p>
            <div className="rubric-preview">
              {rubric?.dimensions.map((d) => (
                <span key={d.id} title={d.prompt}>
                  {d.name}
                  <b>{d.weight}%</b>
                </span>
              ))}
            </div>
            {review?.state === "failed" && (
              <p className="tool-error">{review.error}</p>
            )}
            <button
              className="review-primary"
              disabled={loading || review?.state === "evaluating" || busy}
              onClick={start}
            >
              {loading || review?.state === "evaluating" ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <ScanLine size={18} />
              )}{" "}
              {loading
                ? "读取评测记录…"
                : review?.state === "evaluating"
                  ? "正在查看图片并评测…"
                  : review?.state === "failed"
                    ? "重新发起评测"
                    : "开始 AI 海报评测"}
            </button>
            <p className="review-disclaimer">
              {STATIC_DEMO ? "展示模式不发起新评测。完整版使用" : "使用"}{" "}
              {reviewModel}{" "}
              分析图片，会产生模型费用。结果属于设计建议，打开已完成的评测不会重复计费。
            </p>
            {review?.state === "evaluating" && (
              <p className="review-disclaimer">
                可以关闭窗口，评测会在后台继续，稍后从画布重新打开。
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="review-overview">
            <div className="score-block">
              <span className="eyebrow">DESIGN REVIEW</span>
              <div className="score-number">
                {report.overall}
                <span>/ 100</span>
              </div>
              <span className="score-caption">六维加权综合分</span>
              {delta !== null && (
                <span className="score-delta">
                  较上一版 {delta > 0 ? "+" : ""}
                  {delta} 分 · AI 建议性评分
                </span>
              )}
              <p>{report.summary}</p>
            </div>
            <Radar metrics={report.dimensions} />
            <div className="review-mini">
              <img src={job.image_url} alt="本次评测对应版本" />
              <span>
                <Eye size={12} />
                当前评测版本
              </span>
            </div>
          </div>
          <div className="review-strengths">
            <Sparkles size={17} />
            <div>
              <b>这些优点，值得保留</b>
              <p>{report.strengths.join("；")}</p>
            </div>
          </div>
          <div className="review-heading">
            <div>
              <h3>选择你想改进的方向</h3>
              <p>已优先选择得分较低的维度，可取消或重新选择。</p>
            </div>
            <button
              onClick={() =>
                setSelected(
                  selected.length ? [] : report.dimensions.map((m) => m.id),
                )
              }
            >
              {selected.length ? "取消全选" : "全选建议"}
            </button>
          </div>
          <div className="review-metrics">
            {report.dimensions.map((m) => (
              <article
                key={m.id}
                className={selected.includes(m.id) ? "selected" : ""}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={() =>
                      setSelected(
                        selected.includes(m.id)
                          ? selected.filter((x) => x !== m.id)
                          : [...selected, m.id],
                      )
                    }
                  />
                  <span>
                    {m.name}
                    <small>权重 {m.weight}%</small>
                  </span>
                  <b>
                    {m.score}
                    <small>分</small>
                  </b>
                </label>
                <div className="metric-bar">
                  <i style={{ width: m.score + "%" }} />
                </div>
                <p>
                  <strong>观察</strong>
                  {m.evidence}
                </p>
                <p className="metric-suggestion">
                  <strong>建议</strong>
                  {m.suggestion}
                </p>
              </article>
            ))}
          </div>
          <RevisionModePicker value={revisionMode} onChange={setRevisionMode} />
          <label className="tool-field">
            补充视觉要求（可选）
            <textarea
              rows={2}
              value={note}
              maxLength={1500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：不要改变品牌色，标题保持左对齐…"
            />
          </label>
          <div className="review-action">
            <div>
              <b>已选 {selected.length} 个方向</b>
              <small>保留事实与原版，按所选幅度重新设计</small>
            </div>
            <button
              className="review-primary"
              disabled={!selected.length || applying || busy}
              onClick={apply}
            >
              {applying ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              {applying ? "正在提交优化…" : "按所选建议生成新版"}
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="review-foot">
            <span>
              视觉模型 {review.model} · 评分可波动，不代表客观质量认证
            </span>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(review, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "PosterLab-review-" + job.id.slice(0, 8) + ".json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={13} />
              导出评测报告
            </button>
          </div>
          <details className="rubric-details">
            <summary>查看评测标准与费用说明</summary>
            {rubric?.dimensions.map((d) => (
              <p key={d.id}>
                <b>
                  {d.name} · {d.weight}%
                </b>{" "}
                {d.prompt}
              </p>
            ))}
            <p>
              总分是六维评分按权重求和。视觉API实际用量保存在服务端；尚未配置视觉模型单价，因此不伪报费用，按每次
              ¥0.10 保留预算，实际账单以平台为准。
            </p>
          </details>
        </>
      )}
    </div>
  );
}
