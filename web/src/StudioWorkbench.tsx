import { useEffect, useRef, useState } from "react";
import {
  Download,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Check,
  Copy,
  PanelsTopLeft,
  FileStack,
  Images,
} from "lucide-react";
import LiveStudioLink from "./LiveStudioLink";
import { kits, kitBase, useKitFiles } from "./published-kits";
import "./home-workspace.css";

const paperKit = kits.find((kit) => kit.id === "clashbench")!;
const eventKit = kits.find((kit) => kit.id === "cyanotype")!;
const chapters = [
  {
    name: "论文宣传",
    description:
      "上传论文 PDF，为小红书、X、朋友圈和公众号分别生成宣传文案与配图。",
    primary: "导入论文 PDF",
    path: "#papers/import",
    secondary: "编辑 ClashBench 案例",
    deep: "#papers/example/clashbench",
    icon: FileStack,
  },
  {
    name: "活动宣传",
    description:
      "粘贴活动通知，制作竖版海报、方图和横幅，配齐预告、行前提醒和当天邀请。",
    primary: "制作活动海报",
    path: "#campaign",
    secondary: "打开发布计划",
    deep: "#campaign/plan",
    icon: CalendarDays,
  },
];
const channels = ["小红书笔记", "X 串帖", "朋友圈分享", "公众号导读"];
const shapes = [
  { name: "竖版", size: "1080 × 1440", use: "张贴与群聊邀请" },
  { name: "方图", size: "1080 × 1080", use: "社交动态" },
  { name: "横幅", size: "1920 × 1080", use: "活动页与演示封面" },
];

function Sample({
  event,
  index,
  select,
  ready,
}: {
  event: boolean;
  index: number;
  select: (index: number) => void;
  ready: boolean;
}) {
  const kit = event ? eventKit : paperKit;
  const { files, error, retry } = useKitFiles(kit, ready);
  const current = files[index];
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    setNotice("");
    return () => {
      sequence.current++;
      clearTimeout(timer.current);
    };
  }, [index]);
  async function copy() {
    if (!current) return;
    const seq = ++sequence.current;
    let answer = "已复制全文";
    try {
      await navigator.clipboard.writeText(current.text);
    } catch {
      answer = "可选中正文复制";
    }
    if (seq !== sequence.current) return;
    clearTimeout(timer.current);
    setNotice(answer);
    timer.current = setTimeout(() => setNotice(""), 2600);
  }
  const channel = kit.formats[index];
  const [leading, ...remaining] = (current?.text.trim() || "").split(/\n\s*\n/);
  const hasTitle = !event && (channel === "小红书" || channel === "公众号");
  const words = hasTitle ? remaining.join("\n\n") : current?.text.trim();
  return (
    <div
      className={"pl-sample pl-output pl-output-" + (event ? "event" : "paper")}
    >
      <div className="pl-output-head">
        <strong>
          {event ? <Images size={17} /> : <PanelsTopLeft size={17} />}{" "}
          {event ? "活动海报" : "平台成稿"}
        </strong>
        <span>{kit.label}</span>
      </div>
      <div className="pl-output-stage">
        <div className="pl-output-art" data-channel={channel}>
          {current ? (
            <img src={current.url} alt={kit.label + " · " + channel + "成品"} />
          ) : (
            <img
              className="pl-cover-thumb"
              src={kitBase + kit.id + ".webp"}
              alt=""
              loading="lazy"
            />
          )}
        </div>
        <div className="pl-output-content">
          <div
            className="pl-output-tabs"
            role="group"
            aria-label={event ? "选择案例画幅" : "选择案例平台"}
          >
            {kit.formats.map((label, i) => (
              <button
                type="button"
                key={label}
                aria-pressed={index === i}
                onClick={() => select(i)}
              >
                {event ? shapes[i].name : label}
              </button>
            ))}
          </div>
          {event ? (
            <div className="pl-format-detail">
              <h4>{channel}</h4>
              <b>
                {shapes[index].size} <small>px</small>
              </b>
              <p>{shapes[index].use}</p>
            </div>
          ) : (
            <div
              className="pl-output-copy"
              tabIndex={0}
              aria-label={channels[index] + "示例全文"}
            >
              {hasTitle && leading && <h4>{leading}</h4>}
              <p lang={channel === "X" ? "en" : "zh-CN"}>{words}</p>
            </div>
          )}
          <div className="pl-output-action">
            {error ? (
              <button type="button" onClick={retry}>
                重试加载
              </button>
            ) : event && current ? (
              <a
                href={current.url}
                download={kit.title + "-" + channel + ".png"}
              >
                <Download size={15} />
                下载此画幅
              </a>
            ) : !event ? (
              <button type="button" onClick={copy} disabled={!current}>
                {notice.startsWith("已复制") ? (
                  <Check size={15} />
                ) : (
                  <Copy size={15} />
                )}
                <span aria-live="polite">{notice || "复制文案"}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="pl-output-foot">
        {event ? (
          <span>蓝晒工作坊 · 海边印刷室</span>
        ) : (
          <a
            href="https://arxiv.org/abs/2609.19892"
            target="_blank"
            rel="noreferrer"
          >
            ClashBench · Yuejin Xie 等 · 图 2、表 1 裁自原论文 · CC BY 4.0
          </a>
        )}
        <a
          href={kitBase + kit.id + ".zip"}
          download={kit.label + "-宣传材料.zip"}
        >
          <Download size={14} />
          下载示例整套
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
  const followScroll = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "220px" },
    );
    observer.observe(rail.current!);
    return () => observer.disconnect();
  }, []);
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
        !followScroll.current ||
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
    // An anchor's smooth scroll can continue after the visitor has selected a
    // channel. Only a fresh, deliberate page scroll may change the scene.
    function scrollIntent(event: Event) {
      if (
        event.target instanceof Element &&
        event.target.closest(".pl-output-copy")
      )
        return;
      if (
        event instanceof KeyboardEvent &&
        ![
          "PageDown",
          "PageUp",
          "ArrowDown",
          "ArrowUp",
          "End",
          "Home",
          " ",
        ].includes(event.key)
      )
        return;
      followScroll.current = true;
    }
    window.addEventListener("wheel", scrollIntent, { passive: true });
    window.addEventListener("touchmove", scrollIntent, { passive: true });
    window.addEventListener("keydown", scrollIntent);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("wheel", scrollIntent);
      window.removeEventListener("touchmove", scrollIntent);
      window.removeEventListener("keydown", scrollIntent);
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <section
      className="pl-work home-workspace"
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
                <h3>
                  <button
                    className="pl-scene-button"
                    type="button"
                    aria-controls="pl-live-preview"
                    aria-pressed={active === i}
                    onClick={() => {
                      followScroll.current = false;
                      setActive(i);
                    }}
                  >
                    <span className="pl-scene-icon" aria-hidden="true">
                      <item.icon size={19} />
                    </span>
                    {item.name}
                    <ChevronRight
                      className="pl-scene-next"
                      size={19}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <p>{item.description}</p>
                <div className="pl-work-actions">
                  <a className="pl-launch" href={item.path}>
                    {item.primary} <ArrowUpRight size={15} />
                  </a>
                  <LiveStudioLink route={item.path} />
                  <a className="pl-work-more" href={item.deep}>
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
              onPointerDownCapture={() => {
                followScroll.current = false;
              }}
              onFocusCapture={() => {
                followScroll.current = false;
              }}
              role="region"
              aria-label="成品交互演示"
            >
              {active === 0 ? (
                <Sample
                  key="paper"
                  event={false}
                  index={page}
                  select={setPage}
                  ready={ready}
                />
              ) : (
                <Sample
                  key="event"
                  event
                  index={stage}
                  select={setStage}
                  ready={ready}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
