import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { kits } from "./published-kits";
import { useDemoPlayback } from "./useDemoPlayback";

const base = import.meta.env.BASE_URL + "showcase/";
const order = [
  "cyanotype",
  "clashbench",
  "bookfair",
  "ligo",
  "campaign",
  "paper",
  "ponder-live",
];
const exhibits = order.map((id) => kits.find((kit) => kit.id === id)!);

export default function PosterWall() {
  const { viewport, index, playing, select, toggle } = useDemoPlayback(
    exhibits.length,
    5300,
  );
  const current = exhibits[index];
  return (
    <div
      ref={viewport}
      className="wall-reel"
      onFocusCapture={(event) => {
        if (event.target.closest("a")) select(index);
      }}
      data-palette={current.id}
      role="region"
      aria-roledescription="轮播"
      aria-label="宣传案例轮播"
    >
      <div className="wall-reel-deck">
        {exhibits.map((item, n) => {
          const d = (n - index + exhibits.length) % exhibits.length;
          const offset =
            d > Math.floor(exhibits.length / 2) ? d - exhibits.length : d;
          return (
            <a
              key={item.id}
              className="wall-reel-card"
              href={"#collection/" + item.id}
              data-offset={Math.max(-2, Math.min(2, offset))}
              tabIndex={offset === 0 ? 0 : -1}
              aria-hidden={Math.abs(offset) > 1}
              aria-label={"查看完整案例：" + item.label}
            >
              <img
                src={base + "gallery-" + item.id + ".webp"}
                alt={item.title}
                width="540"
                height="720"
                decoding="async"
                draggable={false}
                fetchPriority={n === 0 ? "high" : "auto"}
              />
            </a>
          );
        })}
      </div>
      <div className="wall-reel-bar">
        <a href={"#collection/" + current.id}>
          <span>{current.formats.includes("X") ? "论文宣传" : "活动宣传"}</span>
          <strong>{current.label}</strong>
          <ArrowUpRight size={16} />
        </a>
        <div className="reel-buttons">
          <button
            type="button"
            onClick={() => select(index - 1)}
            aria-label="上一个案例"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "暂停案例轮播" : "播放案例轮播"}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            onClick={() => select(index + 1)}
            aria-label="下一个案例"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="wall-index" role="group" aria-label="选择首屏案例">
        {exhibits.map((item, n) => (
          <button
            key={item.id}
            type="button"
            aria-label={"展示" + item.label}
            aria-pressed={index === n}
            onClick={() => select(n)}
          />
        ))}
      </div>
    </div>
  );
}
