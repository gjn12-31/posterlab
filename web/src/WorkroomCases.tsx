import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, X } from "lucide-react";
import { kits } from "./published-kits";
import { PublishedKitProof } from "./PublishedKits";
import "./workroom-cases.css";

const descriptions: Record<string, [string, string]> = {
  clashbench: [
    "智能体评测",
    "从原论文的 Figure 2 与 Table 1，看同一组实验怎样写给四个平台的读者。",
  ],
  ligo: [
    "天文观测",
    "把两台探测器记录到的波形与发现故事放在一起，比较长文与短帖的切入点。",
  ],
  "ponder-live": [
    "语言模型",
    "用一张竖图说清模型的核心想法，再读写给技术同行的英文短帖。",
  ],
  paper: [
    "科学影像",
    "从一张黑洞照片出发，在四种画幅里保留尺度、观测来源和研究问题。",
  ],
  cyanotype: [
    "手作工作坊",
    "一张蓝晒主视觉，分别排成工作室门口的海报、社交方图和报名页横幅。",
  ],
  bookfair: [
    "独立出版",
    "灯下翻开的书成为主图，邀请文案接着讲清翻阅、看装帧和逛书展的理由。",
  ],
  campaign: [
    "街区市集",
    "把手冲摊位和周末集市写进入场邀请，同时交代集合时间与地点。",
  ],
};

export default function WorkroomCases({
  kind,
}: {
  kind: "paper" | "campaign";
}) {
  const [open, setOpen] = useState<string>();
  const entries = kits.filter((k) => (kind === "campaign") === "editable" in k);
  return (
    <section
      className="workroom-cases"
      aria-label={kind === "paper" ? "论文宣传案例" : "活动宣传案例"}
    >
      <header>
        <h2>{kind === "paper" ? "论文宣传案例" : "活动宣传案例"}</h2>
        <span>{entries.length} 组完整作品</span>
      </header>
      {entries.map((kit, i) => {
        const active = open === kit.id;
        const [topic, description] = descriptions[kit.id];
        return (
          <article className="workroom-case" key={kit.id}>
            <button
              type="button"
              className="workroom-case-card"
              aria-expanded={active}
              aria-controls={"case-details-" + kit.id}
              onClick={() => setOpen(active ? undefined : kit.id)}
            >
              <div className={"workroom-case-print tone-" + (i % 4)}>
                <img
                  loading="lazy"
                  src={
                    import.meta.env.BASE_URL +
                    "showcase/gallery-" +
                    kit.id +
                    ".webp"
                  }
                  alt={kit.label + "海报预览"}
                />
              </div>
              <div className="workroom-case-caption">
                <span>{topic}</span>
                <h3>{kit.title}</h3>
                <p>{description}</p>
                <b>
                  {active ? "收起成品" : "查看整套成品"}{" "}
                  {active ? <X size={16} /> : <ArrowDownRight size={16} />}
                </b>
              </div>
            </button>
            {active && (
              <div
                className="workroom-case-detail"
                id={"case-details-" + kit.id}
              >
                <PublishedKitProof kit={kit} ready />
              </div>
            )}
          </article>
        );
      })}
      <a className="workroom-case-end" href="#collection">
        浏览全部作品 <ArrowUpRight size={16} />
      </a>
    </section>
  );
}
