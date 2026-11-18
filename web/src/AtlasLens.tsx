import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Minus,
  Plus,
  RotateCcw,
  Maximize,
  BookmarkPlus,
  Check,
  X,
} from "lucide-react";
import type { Artwork } from "./atlas-data";

import { fullView, type View, type Crop } from "./atlas-crop";
export { fullView, type View } from "./atlas-crop";
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
export function ZoomTools({
  view,
  change,
}: {
  view: View;
  change: (v: View) => void;
}) {
  return (
    <div className="at-zoomtools" role="group" aria-label="图像缩放">
      <button
        aria-label="缩小"
        disabled={view.zoom <= 1}
        onClick={() => change({ ...view, zoom: clamp(view.zoom - 0.5, 1, 4) })}
      >
        <Minus size={16} />
      </button>
      <output>{Math.round(view.zoom * 100)}%</output>
      <button
        aria-label="放大"
        disabled={view.zoom >= 4}
        onClick={() => change({ ...view, zoom: clamp(view.zoom + 0.5, 1, 4) })}
      >
        <Plus size={16} />
      </button>
      <button aria-label="恢复全图" onClick={() => change(fullView)}>
        <RotateCcw size={15} />
      </button>
    </div>
  );
}
type LensProps = {
  work: Artwork;
  view: View;
  change: (v: View) => void;
  frame?: (c: Crop) => void;
};
export function Lens({ work, view, change, frame }: LensProps) {
  const root = useRef<HTMLDivElement>(null),
    img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [natural, setNatural] = useState({ width: 1, height: 1 });
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  useLayoutEffect(() => {
    const r = root.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: r.clientWidth, height: r.clientHeight }),
    );
    observer.observe(r);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(
    size.width / natural.width,
    size.height / natural.height,
  );
  const width = natural.width * fit * view.zoom,
    height = natural.height * fit * view.zoom;
  const extraX = Math.max(0, width - size.width),
    extraY = Math.max(0, height - size.height);
  const left = extraX
    ? clamp(size.width / 2 - view.x * width, -extraX, 0)
    : (size.width - width) / 2;
  const top = extraY
    ? clamp(size.height / 2 - view.y * height, -extraY, 0)
    : (size.height - height) / 2;
  useLayoutEffect(() => {
    if (width > 0 && height > 0)
      frame?.({
        x: clamp(-left / width),
        y: clamp(-top / height),
        w: Math.min(1, size.width / width),
        h: Math.min(1, size.height / height),
      });
  }, [width, height, left, top, frame, size.width, size.height]);
  function move(e: PointerEvent) {
    const g = drag.current;
    if (!g || g.id !== e.pointerId) return;
    change({
      ...view,
      x: extraX
        ? clamp(
            g.x - (e.clientX - g.startX) / width,
            size.width / (2 * width),
            1 - size.width / (2 * width),
          )
        : 0.5,
      y: extraY
        ? clamp(
            g.y - (e.clientY - g.startY) / height,
            size.height / (2 * height),
            1 - size.height / (2 * height),
          )
        : 0.5,
    });
  }
  return (
    <div
      className={"at-lens" + (view.zoom > 1 ? " magnified" : "")}
      ref={root}
      tabIndex={0}
      role="group"
      aria-label={work.title + "看图区域，放大后可以拖动或用方向键平移"}
      onPointerDown={(e) => {
        if (view.zoom <= 1 || e.button !== 0) return;
        drag.current = {
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          x: (size.width / 2 - left) / width,
          y: (size.height / 2 - top) / height,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={(e) => {
        if (view.zoom > 1) {
          change(fullView);
          return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        change({
          zoom: 2.5,
          x: clamp((e.clientX - r.left - left) / width),
          y: clamp((e.clientY - r.top - top) / height),
        });
      }}
      onKeyDown={(e) => {
        const d = 0.08;
        const moves: Record<string, [number, number]> = {
          ArrowLeft: [-d, 0],
          ArrowRight: [d, 0],
          ArrowUp: [0, -d],
          ArrowDown: [0, d],
        };
        if (moves[e.key] && view.zoom > 1) {
          e.preventDefault();
          const [x, y] = moves[e.key];
          change({ ...view, x: clamp(view.x + x), y: clamp(view.y + y) });
        }
      }}
    >
      <img
        key={work.id}
        ref={img}
        src={work.image}
        draggable={false}
        alt={work.title}
        onLoad={(e) => {
          setNatural({
            width: e.currentTarget.naturalWidth,
            height: e.currentTarget.naturalHeight,
          });
        }}
        style={{ width, height, left, top }}
      />
    </div>
  );
}
export function Lightbox({
  work,
  close,
  initial = fullView,
  label,
  save,
}: {
  work: Artwork;
  close: () => void;
  initial?: View;
  label?: string;
  save?: (c: Crop) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [view, change] = useState(initial),
    [recorded, record] = useState(false);
  const [frame, setFrame] = useState<Crop | null>(null);
  function adjust(v: View) {
    change(v);
    record(false);
  }
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      className="at-lightbox"
      ref={ref}
      onCancel={close}
      aria-label={work.title + "高清看图"}
    >
      <header>
        <span>
          <Maximize size={16} /> 高清看图
        </span>
        <button aria-label="关闭高清看图" onClick={close}>
          <X />
        </button>
      </header>
      <Lens work={work} view={view} change={adjust} frame={setFrame} />
      <footer>
        <div>
          <b>
            {work.title}
            {label ? " · " + label : ""}
          </b>
          <small>
            {label === "富士山"
              ? "远方雪顶的三角轮廓，与近处的白浪彼此呼应。"
              : label === "浪尖"
                ? "沿浪冠向右看，泡沫的弧线渐渐分成细小的指爪。"
                : "双击放大，再拖动查看局部"}
          </small>
        </div>
        <div className="at-light-actions">
          <ZoomTools view={view} change={adjust} />
          {save && (
            <button
              className="at-crop-save"
              disabled={!frame || view.zoom <= 1 || recorded}
              onClick={() => {
                if (frame) {
                  save(frame);
                  record(true);
                }
              }}
            >
              {recorded ? <Check size={15} /> : <BookmarkPlus size={15} />}{" "}
              {recorded ? "局部已收藏" : "收藏当前局部"}
            </button>
          )}
        </div>
      </footer>
    </dialog>
  );
}
