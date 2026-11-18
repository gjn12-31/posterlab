import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import { ImagePlus, Type, Trash2, ArrowDownToLine } from "lucide-react";
import { platforms, type Channel, type Paper } from "./paper-model";
import type { PosterLayout, PosterObject } from "./paper-layout-model";
import {
  imageObject,
  layoutSources,
  makePaperLayout,
  paperLayoutPage,
} from "./paper-layout";
import { loadFonts } from "./render";
import { clashbenchSource } from "./clashbench-case";
import "./paper-layout-editor.css";

type Bounds = Pick<PosterObject, "x" | "y" | "w" | "h">;
type Gesture = {
  id: number;
  mode: "move" | "size";
  initial: PosterObject;
  dx: number;
  dy: number;
  left: number;
  top: number;
  width: number;
  height: number;
  draft: PosterObject;
};
const bound = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(n, max));
const axisNames = {
  x: "水平位置",
  y: "垂直位置",
  w: "宽度",
  h: "高度",
} as const;
function resize(o: PosterObject, w: number, h: number): Bounds {
  if (o.type === "image") {
    const scale = bound(
      Math.max(w / o.w, h / o.h),
      Math.max(0.025 / o.w, 0.025 / o.h),
      Math.min((1 - o.x) / o.w, (1 - o.y) / o.h),
    );
    return { x: o.x, y: o.y, w: o.w * scale, h: o.h * scale };
  }
  return {
    x: o.x,
    y: o.y,
    w: bound(w, 0.025, 1 - o.x),
    h: bound(h, 0.018, 1 - o.y),
  };
}
export default function PaperLayoutEditor({
  paper,
  channel,
  onChange,
}: {
  paper: Paper;
  channel: Channel;
  onChange: (paper: Paper) => void;
}) {
  const base = useMemo(
    () => paper.posterLayouts?.[channel] || makePaperLayout(paper, channel),
    [paper, channel],
  );
  const [selection, setSelection] = useState("title"),
    [draft, setDraft] = useState<PosterObject>(),
    [asset, setAsset] = useState("");
  const [fonts, setFonts] = useState(0);
  const stage = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null);
  const ctx = useMemo(
    () => document.createElement("canvas").getContext("2d")!,
    [],
  );
  const sources = useMemo(
    () => layoutSources(paper),
    [paper.visuals, paper.figure, paper.artwork],
  );
  const source = sources.find((v) => v.id === asset) || sources[0];
  const dims = platforms[channel];
  const objects = useMemo(
    () =>
      draft
        ? base.objects.map((o) => (o.id === draft.id ? draft : o))
        : base.objects,
    [base, draft],
  );
  const selected = objects.find((o) => o.id === selection) || objects[0];
  const selectedAsset =
    selected?.type === "image"
      ? sources.find((s) => s.id === selected.source)
      : undefined;
  const text = base.objects
    .flatMap((o) => (o.type === "text" ? [o.text] : []))
    .join(" ");
  useEffect(() => {
    let live = true;
    loadFonts(text)
      .then(() => {
        if (live) setFonts((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [text]);
  useEffect(() => {
    gesture.current = null;
    setDraft(undefined);
    setSelection("title");
  }, [paper.id, channel]);
  const page = useMemo(
    () => paperLayoutPage(paper, channel, { ...base, objects }, ctx),
    [paper, channel, base, objects, ctx, fonts],
  );
  function commit(layout: PosterLayout) {
    onChange({
      ...paper,
      posterLayouts: {
        ...paper.posterLayouts,
        [channel]: { ...layout, edited: true },
      },
    });
  }
  function patch(next: PosterObject) {
    commit({
      ...base,
      objects: base.objects.map((o) => (o.id === next.id ? next : o)),
    });
  }
  function begin(
    e: PointerEvent<HTMLElement>,
    o: PosterObject,
    mode: Gesture["mode"],
  ) {
    if (e.button !== 0 || !stage.current) return;
    e.preventDefault();
    e.stopPropagation();
    setSelection(o.id);
    const r = stage.current.getBoundingClientRect();
    gesture.current = {
      id: e.pointerId,
      mode,
      initial: o,
      draft: o,
      dx: e.clientX,
      dy: e.clientY,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = (e.clientX - g.dx) / g.width,
      dy = (e.clientY - g.dy) / g.height,
      o = g.initial;
    const box =
      g.mode === "move"
        ? { x: bound(o.x + dx, 0, 1 - o.w), y: bound(o.y + dy, 0, 1 - o.h) }
        : resize(o, o.w + dx, o.h + dy);
    g.draft = { ...o, ...box };
    setDraft(g.draft);
  }
  function end(e: PointerEvent, cancel = false) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setDraft(undefined);
    if (!cancel && g.draft !== g.initial) patch(g.draft);
  }
  function key(e: KeyboardEvent<HTMLElement>, o: PosterObject) {
    const scale = e.shiftKey ? 10 : 1;
    const arrows: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const delta = arrows[e.key];
    if (!delta) return;
    e.preventDefault();
    setSelection(o.id);
    patch({
      ...o,
      x: bound(o.x + (delta[0] * scale) / dims.width, 0, 1 - o.w),
      y: bound(o.y + (delta[1] * scale) / dims.height, 0, 1 - o.h),
    });
  }
  function setAxis(k: keyof Bounds, value: number) {
    if (!selected || !Number.isFinite(value)) return;
    const o = selected,
      n = value / (k === "x" || k === "w" ? dims.width : dims.height);
    if (k === "x" || k === "y") {
      patch({ ...o, [k]: bound(n, 0, 1 - (k === "x" ? o.w : o.h)) });
      return;
    }
    if (o.type === "image") {
      const scale = k === "w" ? n / o.w : n / o.h;
      patch({ ...o, ...resize(o, o.w * scale, o.h * scale) });
    } else
      patch({ ...o, ...resize(o, k === "w" ? n : o.w, k === "h" ? n : o.h) });
  }
  function add(o: PosterObject) {
    if (base.objects.length >= 50) return;
    commit({ ...base, objects: [...base.objects, o] });
    setSelection(o.id);
  }
  async function addSource(replace = false) {
    if (!source) return;
    let ready = source;
    if (!source.width || !source.height) {
      const img = new Image();
      img.src = source.data;
      await img.decode();
      ready = { ...source, width: img.naturalWidth, height: img.naturalHeight };
    }
    if (replace && selected?.type === "image") {
      const image = imageObject(ready, channel, selected, selected.id);
      const captionId = selected.id.endsWith("-image")
        ? selected.id.replace(/-image$/, "-source")
        : undefined;
      commit({
        ...base,
        objects: base.objects.map((o) =>
          o.id === selected.id
            ? image
            : o.id === captionId &&
                o.type === "text" &&
                o.text === selected.name
              ? { ...o, text: ready.name }
              : o,
        ),
      });
      return;
    }
    add(imageObject(ready, channel, { x: 0.2, y: 0.32, w: 0.6, h: 0.36 }));
  }

  return (
    <section className="ple" aria-label="论文海报排版编辑器">
      <div className="ple-stage-wrap">
        <div
          className="ple-stage"
          ref={stage}
          style={
            {
              aspectRatio: dims.width + "/" + dims.height,
              "--paper-ratio": dims.width / dims.height,
            } as React.CSSProperties
          }
          onPointerMove={move}
          onPointerUp={(e) => end(e)}
          onPointerCancel={(e) => end(e, true)}
        >
          <svg
            className="ple-art"
            viewBox={`0 0 ${dims.width} ${dims.height}`}
            aria-label={paper.headline + " · " + dims.name + "可编辑海报"}
            role="img"
          >
            {page.elements.map((el, i) =>
              el.type === "rect" ? (
                <rect
                  key={i}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  fill={el.fill}
                />
              ) : el.type === "image" ? (
                <image
                  key={i}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  href={el.src}
                  preserveAspectRatio="none"
                />
              ) : (
                <text
                  key={i}
                  x={el.x}
                  y={el.y}
                  fontSize={el.fontSize}
                  fontWeight={el.bold ? 700 : 400}
                  fill={el.color}
                  fontFamily={
                    'PosterCommon, PosterSans, "PingFang SC", Arial, sans-serif'
                  }
                  dominantBaseline="text-before-edge"
                >
                  {el.text.split("\n").map((line, n) => (
                    <tspan
                      key={n}
                      x={el.x}
                      y={el.y + n * el.fontSize * (el.lineHeight || 1.22)}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              ),
            )}
          </svg>
          {objects.map((o) => (
            <div
              key={o.id}
              className="ple-object"
              data-selected={o.id === selected?.id}
              style={{
                left: o.x * 100 + "%",
                top: o.y * 100 + "%",
                width: o.w * 100 + "%",
                height: o.h * 100 + "%",
              }}
            >
              <button
                type="button"
                className="ple-pick"
                aria-label={"移动" + o.name}
                aria-pressed={o.id === selected?.id}
                onPointerDown={(e) => begin(e, o, "move")}
                onFocus={() => setSelection(o.id)}
                onClick={() => setSelection(o.id)}
                onKeyDown={(e) => key(e, o)}
              />
              {o.id === selected?.id && (
                <button
                  type="button"
                  className="ple-grip"
                  aria-label={"调整" + o.name + "的尺寸"}
                  onPointerDown={(e) => begin(e, o, "size")}
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowUp",
                        "ArrowDown",
                        "ArrowLeft",
                        "ArrowRight",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const s = e.shiftKey ? 10 : 1;
                    const factor =
                      e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
                    const w = o.w + (factor * s) / dims.width,
                      h =
                        o.h +
                        (o.type === "image"
                          ? (((factor * s) / dims.width) * o.h) / o.w
                          : (factor * s) / dims.height);
                    patch({ ...o, ...resize(o, w, h) });
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <p className="ple-help">
          拖动元素定位，拖动角点缩放。方向键可微调，按住 Shift 移动 10 像素。
        </p>
        {paper.source === clashbenchSource && (
          <p className="ple-help">
            原图裁自 Yuejin Xie 等人的{" "}
            <a href={clashbenchSource} target="_blank" rel="noreferrer">
              ClashBench 论文
            </a>
            ， 依{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>{" "}
            重新排版。
          </p>
        )}
      </div>
      <aside className="ple-controls">
        <label>
          当前图层
          <select
            value={selected?.id || ""}
            onChange={(e) => setSelection(e.target.value)}
          >
            {objects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {selected?.type === "text" && (
          <label>
            文字内容
            <textarea
              rows={3}
              value={selected.text}
              maxLength={3200}
              onChange={(e) => patch({ ...selected, text: e.target.value })}
            />
          </label>
        )}
        {selectedAsset && (
          <a href={selectedAsset.data} download={selectedAsset.name + ".jpg"}>
            <ArrowDownToLine size={14} />
            下载原图 · {selectedAsset.name}
          </a>
        )}
        {selected && (
          <div className="ple-geometry">
            {(Object.keys(axisNames) as (keyof Bounds)[]).map((k) => (
              <label key={k}>
                {axisNames[k]}
                <input
                  type="number"
                  step="1"
                  min={k === "x" || k === "y" ? 0 : 1}
                  value={Math.round(
                    selected[k] *
                      (k === "x" || k === "w" ? dims.width : dims.height),
                  )}
                  onChange={(e) => {
                    if (e.target.value) setAxis(k, e.target.valueAsNumber);
                  }}
                />
              </label>
            ))}
          </div>
        )}
        {selected?.type === "text" && (
          <div className="ple-geometry">
            <label>
              字号
              <input
                type="number"
                min={7}
                max={250}
                value={Math.round(selected.size)}
                onChange={(e) => {
                  if (e.target.value)
                    patch({
                      ...selected,
                      size: bound(e.target.valueAsNumber, 7, 250),
                    });
                }}
              />
            </label>
            <label>
              文字颜色
              <input
                type="color"
                value={selected.color}
                onChange={(e) => patch({ ...selected, color: e.target.value })}
              />
            </label>
          </div>
        )}
        <button
          type="button"
          className="ple-remove"
          disabled={!selected || objects.length <= 1}
          onClick={() => {
            commit({
              ...base,
              objects: base.objects.filter((o) => o.id !== selected.id),
            });
            setSelection("");
          }}
        >
          <Trash2 size={15} />
          删除所选图层
        </button>
        <div className="ple-add">
          <button
            type="button"
            disabled={objects.length >= 50}
            onClick={() =>
              add({
                id: crypto.randomUUID(),
                name: "自定义文字",
                type: "text",
                text: "输入宣传文案",
                x: 0.16,
                y: 0.32,
                w: 0.6,
                h: 0.09,
                bold: false,
                color: "#202e36",
                size: Math.round(Math.min(dims.width, dims.height) * 0.035),
              })
            }
          >
            <Type size={15} />
            添加文字
          </button>
          {sources.length > 0 && (
            <>
              <label>
                论文图片与表格
                <select
                  value={source?.id || ""}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  {sources.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={objects.length >= 50}
                onClick={() => addSource()}
              >
                <ImagePlus size={15} />
                添加所选图表
              </button>
              {selected?.type === "image" && (
                <button
                  type="button"
                  disabled={!source || source.id === selected.source}
                  onClick={() => addSource(true)}
                >
                  <ImagePlus size={15} />
                  替换当前图片
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
