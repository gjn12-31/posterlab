import { useEffect, useRef, useState } from "react";
import {
  Download,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileStack,
  MapPin,
} from "lucide-react";
import plan from "./showcase-plan.json";

const art = import.meta.env.BASE_URL + "showcase/";
const chapters = [
  {
    name: "论文宣传",
    title: "让论文逐页展开",
    description: "导入 PDF，选好原句，让研究问题、方法和发现各占一页。",
    primary: "导入论文 PDF",
    path: "#papers/import",
    secondary: "编辑图解长帖",
    deep: "#papers/story",
    icon: FileStack,
  },
  {
    name: "活动宣传",
    title: "把发布排上日历",
    description:
      "粘贴活动通知，得到三种画幅，以及预告、行前、当天分别该发的内容。",
    primary: "制作活动海报",
    path: "#campaign",
    secondary: "打开发布计划",
    deep: "#campaign/plan",
    icon: CalendarDays,
  },
];
const pages = ["封面", "研究方法", "观测结果", "研究解释"];

function ResearchSample({
  page,
  setPage,
}: {
  page: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="pl-sample pl-research-sample">
      <div className="pl-sample-caption">
        <span>
          <FileStack size={16} /> 论文图解长帖
        </span>
        <span>M87 黑洞观测</span>
      </div>
      <div className="pl-paper-spread" aria-hidden="true">
        {pages.map((_, i) => {
          const offset = (i - page + pages.length) % pages.length;
          return (
            <img
              key={i}
              data-depth={offset}
              src={art + "m87-story-" + (i + 1) + ".webp"}
              alt=""
              loading="lazy"
            />
          );
        })}
      </div>
      <div className="pl-sample-controls">
        <span aria-live="polite">
          {String(page + 1).padStart(2, "0")} <i>/ 04</i>　{pages[page]}
        </span>
        <div>
          <a
            className="pl-sample-download"
            href={import.meta.env.BASE_URL + "kits/m87-story.zip"}
            download="M87-论文图解长帖.zip"
          >
            <Download size={14} />
            下载图组
          </a>
          <button
            type="button"
            aria-label="上一张论文图解"
            onClick={() => setPage((page + 3) % 4)}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            type="button"
            aria-label="下一张论文图解"
            onClick={() => setPage((page + 1) % 4)}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EventSample({
  stage,
  setStage,
}: {
  stage: number;
  setStage: (n: number) => void;
}) {
  return (
    <div className="pl-sample pl-event-sample">
      <div className="pl-sample-caption">
        <span>
          <CalendarDays size={16} /> 活动发布计划
        </span>
        <span>秋夜设计书展</span>
      </div>
      <div className="pl-plan-spread">
        <img
          src={art + "bookfair-" + plan[stage].format + ".webp"}
          width="680"
          height="907"
          alt={
            "秋夜设计书展" +
            (plan[stage].format === "portrait" ? "竖版海报" : "社交方图")
          }
          loading="lazy"
        />
        <div className="pl-plan-sheet">
          <div className="pl-plan-tabs" aria-label="预览各阶段文案">
            {plan.map((s, i) => (
              <button
                type="button"
                key={s.name}
                aria-pressed={i === stage}
                onClick={() => setStage(i)}
              >
                {["预告", "行前", "当天"][i]}
              </button>
            ))}
          </div>
          <div className="pl-plan-page" key={stage} aria-live="polite">
            <time>{plan[stage].date}</time>
            <strong>{plan[stage].name}</strong>
            <p>{plan[stage].copy}</p>
          </div>
        </div>
      </div>
      <div className="pl-sample-controls">
        <span>
          <MapPin size={14} /> 纸间书房 · 二层展厅
        </span>
        <a
          className="pl-sample-download"
          href={import.meta.env.BASE_URL + "kits/bookfair.ics"}
          download="秋夜设计书展-发布日历.ics"
        >
          <Download size={14} />
          下载示例日历
        </a>
      </div>
    </div>
  );
}

export default function StudioWorkbench() {
  const [active, setActive] = useState(0);
  const [page, setPage] = useState(0);
  const [stage, setStage] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const entries = Array.from(
      rail.current!.querySelectorAll<HTMLElement>(".pl-chapter"),
    );
    const wide = matchMedia("(min-width: 851px)");
    let frame = 0,
      previousY = window.scrollY;
    function track() {
      frame = 0;
      const y = window.scrollY,
        dy = y - previousY;
      previousY = y;
      if (
        !wide.matches ||
        !dy ||
        document.querySelector("#pl-live-preview :focus-visible")
      )
        return;
      const top = entries[1].getBoundingClientRect().top;
      if (dy > 0 && top < innerHeight * 0.54) setActive(1);
      else if (dy < 0 && top > innerHeight * 0.62) setActive(0);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(track);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <section
      className="pl-work"
      id="workbench"
      aria-labelledby="pl-work-heading"
    >
      <div className="pl-shell">
        <div className="pl-work-heading">
          <h2 id="pl-work-heading">工作台</h2>
        </div>
        <div className="pl-work-layout">
          <div className="pl-chapters" ref={rail}>
            {chapters.map((item, i) => (
              <article
                className={"pl-chapter pl-chapter-" + i}
                key={item.name}
                data-active={active === i}
              >
                <button
                  className="pl-scene-button"
                  type="button"
                  aria-controls="pl-live-preview"
                  aria-pressed={active === i}
                  onClick={() => setActive(i)}
                >
                  <span>
                    <item.icon size={18} />
                  </span>
                  {item.name}
                </button>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <div className="pl-work-actions">
                  <a className="pl-launch" href={item.path}>
                    {item.primary} <ArrowUpRight size={15} />
                  </a>
                  <a href={item.deep}>
                    {item.secondary} <ArrowRight size={15} />
                  </a>
                </div>
              </article>
            ))}
          </div>
          <div className="pl-preview-wrap">
            <div
              className={"pl-demo-frame pl-frame-" + active}
              id="pl-live-preview"
              role="region"
              aria-label="成品交互演示"
            >
              {active === 0 ? (
                <ResearchSample page={page} setPage={setPage} />
              ) : (
                <EventSample stage={stage} setStage={setStage} />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
