import { useEffect, useState } from "react";
import type { Job } from "./chat-model";

export function GenerationFailure({ job, busy, recover, retry }: {
  job: Job; busy: boolean; recover: () => void; retry: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((job.retry_not_before || 0) - now / 1000));
  useEffect(() => {
    if (!job.retry_not_before || job.retry_not_before * 1000 <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.retry_not_before]);
  const failure = job.failure;
  return <div className="generation-error" role="alert">
    <b>{failure?.message || "这次海报没有完成"}</b>
    <p>{failure?.suggestion || job.error}</p>
    {failure?.charge_uncertain && <p>本次远端费用尚未确认。重新生成会建立新请求，可能产生额外费用。</p>}
    {job.can_rerender && <button className="text-action" disabled={busy} onClick={recover}>
      本地修复并出图（不调用模型）
    </button>}
    <button className="text-action" disabled={busy || remaining > 0} onClick={retry}>
      {remaining > 0 ? `等待 ${remaining} 秒后可重试` : "按原需求重新生成（调用模型）"}
    </button>
    <details>
      <summary>错误详情与任务编号</summary>
      <p>任务：{job.id}</p>
      {failure && <p>错误类型：{failure.code} · 阶段：{failure.stage}</p>}
      <p>{failure?.details || job.error}</p>
      <p>已执行 {job.repair_attempt || 0} 轮模型纠错。原作品和需求仍保留。</p>
    </details>
  </div>;
}
