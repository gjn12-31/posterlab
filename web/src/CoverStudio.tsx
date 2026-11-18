import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  Asterisk,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  Folder,
  History,
  Image as ImageIcon,
  Layers,
  Move,
  Plus,
  Redo2,
  Settings2,
  Sparkles,
  Type,
  Undo2,
  X,
  Trash2,
  ScanText,
  Upload,
  CalendarDays,
} from "lucide-react";
import { editions, editionIds, editionImage } from "./editions";
import {
  formats,
  fields,
  labels,
  type Field,
  type Format,
  type Project,
  type Snapshot,
} from "./model";
import { changeText, layerText, patchLayer, type LayerStyle } from "./cover";
import "./cover-studio.css";
type Tool = "text" | "visual" | "assistant" | "info";
type Props = {
  project: Project;
  format: Format;
  resize: (f: Format) => void;
  svg: string;
  edit: (fn: (s: Snapshot) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saved: string;
  busy: string;
  ready: boolean;
  live: boolean;
  png: () => void;
  more: () => void;
  history: () => void;
  files: () => void;
  notice: () => void;
  rewrite: (id: string, label: string) => void;
  upload: (file: File, role: "heroId" | "logoId") => void;
  assist: (instruction: string, field: Field) => void;
  settings: () => void;
  repair: { field: Field } | null;
};
const toolItems = [
  { id: "text", name: "文字", icon: Type },
  { id: "visual", name: "主视觉", icon: ImageIcon },
  { id: "assistant", name: "创作助手", icon: Sparkles },
  { id: "info", name: "活动信息", icon: CalendarDays },
] as const;
type Gesture = {
  id: string;
  group: SVGGElement;
  svg: SVGSVGElement;
  start: DOMPoint;
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  moved: boolean;
  pointer: number;
};
const clamp = (x: number, high: number) =>
  Math.max(0, Math.min(x, Math.max(0, high)));
function localPoint(svg: SVGSVGElement, x: number, y: number) {
  return new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()!.inverse());
}
export default function CoverStudio(p: Props) {
  const s = p.project.current,
    art = editions[s.edition!],
    dim = formats[p.format];
  const [tool, setTool] = useState<Tool | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [request, setRequest] = useState("");
  const [extraFields, setExtraFields] = useState<Field[]>([]);
  const showField = (f: Field) => !!s.brief[f] || extraFields.includes(f);
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    input = useRef<HTMLTextAreaElement>(null),
    pendingFocus = useRef(false);
  function target(id: string) {
    return root.current?.querySelector<SVGGElement>(
      `g[data-layer="${CSS.escape(id)}"]`,
    );
  }
  function outline(id: string | null) {
    const node = id && target(id);
    if (!node || !root.current) {
      setBox(null);
      return;
    }
    const a = node.getBoundingClientRect(),
      b = root.current.getBoundingClientRect();
    setBox({
      left: a.left - b.left,
      top: a.top - b.top,
      width: a.width,
      height: a.height,
    });
  }
  useLayoutEffect(() => {
    outline(selected);
    if (!root.current) return;
    const ro = new ResizeObserver(() => outline(selected));
    ro.observe(root.current);
    return () => ro.disconnect();
  }, [selected, p.svg, tool, p.format]);
  useEffect(() => {
    if (tool === "text" && pendingFocus.current) {
      pendingFocus.current = false;
      input.current?.focus();
      input.current?.select();
    }
  }, [tool, selected]);
  useEffect(() => {
    if (p.repair) {
      const f = p.repair.field;
      setExtraFields((old) => (old.includes(f) ? old : [...old, f]));
      setSelected(f);
      setTool(f === "title" ? "text" : "info");
      requestAnimationFrame(() =>
        document.getElementById("cover-field-" + f)?.focus(),
      );
    }
  }, [p.repair]);
  useEffect(() => {
    if (
      selected?.startsWith("note-") &&
      !s.notes?.some((n) => n.id === selected)
    ) {
      setSelected(null);
      setTool(null);
    }
  }, [selected, s.notes]);
  function selectText(id: string) {
    setSelected(id);
    pendingFocus.current = true;
    setTool("text");
    if (tool === "text" && selected === id) {
      input.current?.focus();
      input.current?.select();
    }
  }
  function patch(id: string, v: LayerStyle) {
    p.edit((snap) => patchLayer(snap, p.format, id, v));
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !e.isPrimary) return;
    const node = (e.target as Element).closest<SVGGElement>("g[data-layer]");
    if (!node) {
      setSelected(null);
      setTool(null);
      return;
    }
    const id = node.dataset.layer!,
      svg = node.ownerSVGElement!,
      bounds = node.getBBox(),
      matrix = node.transform.baseVal.consolidate()!.matrix;
    gesture.current = {
      id,
      group: node,
      svg,
      start: localPoint(svg, e.clientX, e.clientY),
      x: matrix.e,
      y: matrix.f,
      w: bounds.width,
      h: bounds.height,
      dx: matrix.e,
      dy: matrix.f,
      moved: false,
      pointer: e.pointerId,
    };
    setSelected(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointer) return;
    const pt = localPoint(g.svg, e.clientX, e.clientY);
    if (
      !g.moved &&
      (Math.hypot(pt.x - g.start.x, pt.y - g.start.y) *
        g.svg.getBoundingClientRect().width) /
        dim.width <
        4
    )
      return;
    g.moved = true;
    g.dx = clamp(g.x + pt.x - g.start.x, dim.width - g.w);
    g.dy = clamp(g.y + pt.y - g.start.y, dim.height - g.h);
    g.group.setAttribute("transform", `translate(${g.dx} ${g.dy})`);
    outline(g.id);
  }
  function finish(e: PointerEvent<HTMLDivElement>, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    gesture.current = null;
    if (cancel) {
      g.group.setAttribute("transform", `translate(${g.x} ${g.y})`);
      outline(g.id);
      return;
    }
    if (g.moved) {
      patch(g.id, { x: g.dx / dim.width, y: g.dy / dim.height });
      root.current?.focus({ preventScroll: true });
    } else selectText(g.id);
  }
  function nudge(id: string, dx: number, dy: number) {
    const el = target(id);
    if (!el) return;
    const m = el.transform.baseVal.consolidate()!.matrix,
      b = el.getBBox();
    patch(id, {
      x: clamp(m.e + dx, dim.width - b.width) / dim.width,
      y: clamp(m.f + dy, dim.height - b.height) / dim.height,
    });
  }
  function add() {
    if ((s.notes?.length ?? 0) >= 8) return;
    const id = "note-" + crypto.randomUUID();
    p.edit((snap) => {
      (snap.notes ??= []).push({ id, text: "新文字" });
    });
    selectText(id);
  }
  const selectedId = selected ?? "title",
    currentText = layerText(s, selectedId),
    style = s.layerStyles?.[p.format]?.[selectedId] ?? {};
  const textName =
    selectedId === "credit"
      ? "署名"
      : selectedId === "display"
        ? "主视觉标题"
        : labels[selectedId as Field] || "自由文字";
  function openTool(next: Tool) {
    if (tool === next) {
      setTool(null);
      return;
    }
    if (next === "text" && !selected) setSelected("title");
    setTool(next);
  }
  return (
    <main className="cs-app">
      <header className="cs-top">
        <a className="cs-wordmark" href="./">
          <Asterisk /> PosterLab
        </a>
        <span className="cs-divider" />
        <span className="cs-project-title">
          {s.brief.title || "未命名海报"}
        </span>
        <small role="status" className="cs-status">
          <Check size={13} />
          {p.saved}
        </small>
        <div className="cs-top-actions">
          <button aria-label="撤销" disabled={!p.canUndo} onClick={p.undo}>
            <Undo2 />
          </button>
          <button aria-label="重做" disabled={!p.canRedo} onClick={p.redo}>
            <Redo2 />
          </button>
          <button aria-label="版本历史" onClick={p.history}>
            <History />
          </button>
          <button aria-label="我的作品" onClick={p.files}>
            <Folder />
          </button>
          <div className="cs-export">
            <button disabled={!p.ready || !!p.busy} onClick={p.png}>
              <Download size={16} />
              {p.busy ? "处理中" : "下载 PNG"}
            </button>
            <button aria-label="更多导出格式" onClick={p.more}>
              <ChevronDown size={15} />
            </button>
          </div>
        </div>
      </header>
      <div className="cs-body">
        <nav className="cs-rail" aria-label="画布工具">
          {toolItems.map((t) => (
            <button
              aria-pressed={tool === t.id}
              key={t.id}
              onClick={() => openTool(t.id)}
            >
              <t.icon size={20} />
              <span>{t.name}</span>
            </button>
          ))}
        </nav>
        <section className="cs-stage" aria-label="编辑画布">
          <div className="cs-stage-bar">
            <span>
              <Layers size={15} />
              {art.name}
            </span>
            <div role="group" aria-label="画幅">
              {(Object.keys(formats) as Format[]).map((f) => (
                <button
                  key={f}
                  aria-pressed={p.format === f}
                  onClick={() => p.resize(f)}
                >
                  {formats[f].ratio}
                </button>
              ))}
            </div>
          </div>
          <div className="cs-mat">
            <div
              className={"cs-art cs-" + p.format}
              style={{ aspectRatio: dim.width + "/" + dim.height }}
              ref={root}
              role="group"
              tabIndex={0}
              aria-label="可编辑海报，点击文字修改，拖动调整位置"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={(e) => finish(e)}
              onPointerCancel={(e) => finish(e, true)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                  e.preventDefault();
                  if (e.shiftKey) p.redo();
                  else p.undo();
                } else if (e.key === "Escape") {
                  setTool(null);
                  setSelected(null);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  selectText(selectedId);
                } else if (selected && /^Arrow/.test(e.key)) {
                  e.preventDefault();
                  const n = e.shiftKey ? 10 : 1;
                  nudge(
                    selected,
                    e.key === "ArrowLeft" ? -n : e.key === "ArrowRight" ? n : 0,
                    e.key === "ArrowUp" ? -n : e.key === "ArrowDown" ? n : 0,
                  );
                }
              }}
            >
              <CoverImage svg={p.svg} />
              {box && (
                <span className="cs-selection" aria-hidden="true" style={box}>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </div>
          </div>
          <div className="cs-stage-note">
            <Move size={14} /> 点文字修改，拖动调整位置{" "}
            <span>
              {dim.width} × {dim.height}
            </span>
          </div>
        </section>
        {tool && (
          <aside className="cs-inspector" aria-label="编辑工具">
            <header>
              <h2>{toolItems.find((t) => t.id === tool)?.name}</h2>
              <button aria-label="收起工具" onClick={() => setTool(null)}>
                <X size={18} />
              </button>
            </header>
            {tool === "text" && (
              <>
                <label>
                  文字图层
                  <select
                    aria-label="选择文字图层"
                    value={selectedId}
                    onChange={(e) => selectText(e.target.value)}
                  >
                    {[
                      "credit",
                      "display",
                      "title",
                      ...fields.filter(
                        (f) => f !== "title" && f !== "url" && s.brief[f],
                      ),
                      ...(s.notes ?? []).map((n) => n.id),
                    ].map((id) => (
                      <option key={id} value={id}>
                        {id === "credit"
                          ? "署名"
                          : id === "display"
                            ? "主视觉标题"
                            : labels[id as Field] ||
                              layerText(s, id) ||
                              "自由文字"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {textName}
                  <textarea
                    id={"cover-field-" + selectedId}
                    ref={input}
                    aria-label="修改图层文字"
                    rows={3}
                    value={currentText}
                    maxLength={
                      selectedId === "credit"
                        ? 80
                        : selectedId === "title"
                          ? 180
                          : selectedId === "display"
                            ? 90
                            : selectedId.startsWith("note-")
                              ? 240
                              : selectedId === "description"
                                ? 1200
                                : selectedId === "venue"
                                  ? 220
                                  : selectedId === "date"
                                    ? 10
                                    : selectedId === "time" ||
                                        selectedId === "cta"
                                      ? 80
                                      : 120
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      p.edit((snap) => changeText(snap, selectedId, value));
                    }}
                  />
                </label>
                {p.live && (
                  <button
                    className="cs-action"
                    disabled={
                      !currentText.trim() ||
                      !!p.busy ||
                      ["date", "time", "url"].includes(selectedId)
                    }
                    onClick={() => p.rewrite(selectedId, textName)}
                  >
                    <Sparkles size={15} />
                    {p.busy || "AI 润色这段文字"}
                  </button>
                )}
                <label>
                  字号 <span>{Math.round((style.scale ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min=".45"
                    max="2"
                    step=".05"
                    aria-label="图层字号"
                    value={style.scale ?? 1}
                    onChange={(e) =>
                      patch(selectedId, { scale: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="cs-color">
                  文字颜色
                  <input
                    type="color"
                    aria-label="文字颜色"
                    value={
                      style.color ??
                      (selectedId === "display" ? art.color : "#fff8f1")
                    }
                    onChange={(e) =>
                      patch(selectedId, { color: e.target.value })
                    }
                  />
                </label>
                <div className="cs-panel-actions">
                  <button onClick={add} disabled={(s.notes?.length ?? 0) >= 8}>
                    <Plus /> 添加自由文字
                  </button>
                  {selectedId.startsWith("note-") && (
                    <button
                      aria-label="删除选中文字"
                      onClick={() => {
                        p.edit((snap) => {
                          snap.notes = snap.notes?.filter(
                            (n) => n.id !== selectedId,
                          );
                          for (const map of Object.values(
                            snap.layerStyles ?? {},
                          ))
                            if (map) delete map[selectedId];
                        });
                        setSelected("title");
                      }}
                    >
                      <Trash2 />
                    </button>
                  )}
                </div>
              </>
            )}
            {tool === "visual" && (
              <>
                <div className="cs-options">
                  {editionIds.map((id) => (
                    <button
                      aria-pressed={id === s.edition}
                      key={id}
                      onClick={() =>
                        p.edit((snap) => {
                          snap.edition = id;
                          snap.theme = editions[id].theme;
                          delete snap.heroId;
                        })
                      }
                    >
                      <img src={editionImage(id)} alt="" />
                      {editions[id].name}
                    </button>
                  ))}
                </div>
                <label className="cs-upload">
                  <Upload size={16} />
                  替换背景图片
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) p.upload(file, "heroId");
                      e.target.value = "";
                    }}
                  />
                </label>
                {s.heroId && (
                  <button
                    className="cs-action"
                    onClick={() =>
                      p.edit((snap) => {
                        delete snap.heroId;
                      })
                    }
                  >
                    恢复模板背景
                  </button>
                )}
              </>
            )}
            {tool === "info" && (
              <>
                <button className="cs-action" onClick={p.notice}>
                  <ScanText /> 从活动通知提取
                </button>
                <div className="cs-add-facts">
                  {fields
                    .filter((f) => f !== "title" && !showField(f))
                    .map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setExtraFields((old) => [...old, f]);
                          requestAnimationFrame(() =>
                            document
                              .getElementById("cover-field-" + f)
                              ?.focus(),
                          );
                        }}
                      >
                        <Plus size={13} />
                        {labels[f]}
                      </button>
                    ))}
                </div>
                {fields
                  .filter((f) => f !== "title" && showField(f))
                  .map((f) => (
                    <label key={f}>
                      {labels[f]}
                      <input
                        id={"cover-field-" + f}
                        aria-label={labels[f]}
                        type={
                          f === "date" ? "date" : f === "url" ? "url" : "text"
                        }
                        value={s.brief[f]}
                        placeholder="选填"
                        maxLength={
                          f === "url"
                            ? 1000
                            : f === "description"
                              ? 1200
                              : f === "venue"
                                ? 220
                                : f === "speaker"
                                  ? 120
                                  : 80
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          p.edit((snap) => {
                            snap.brief[f] = val;
                          });
                        }}
                      />
                    </label>
                  ))}
              </>
            )}
            {tool === "assistant" && (
              <>
                <small className="cs-engine">
                  <i />
                  {p.live ? "AI 已连接" : "本地排版助手"}
                </small>
                <p>
                  {p.live
                    ? "输入排版要求，或在文字面板中选中一段文案，请 AI 单独润色。"
                    : "选择排版建议，预览后应用。连接 AI 后也可用自然语言改写活动文案。"}
                </p>
                <div className="cs-chips">
                  {["让活动标题更醒目", "切换自然绿色", "切换午夜深色"].map(
                    (cmd) => (
                      <button
                        key={cmd}
                        disabled={!!p.busy}
                        onClick={() =>
                          p.assist(
                            cmd,
                            selectedId in labels
                              ? (selectedId as Field)
                              : "title",
                          )
                        }
                      >
                        {cmd}
                        <ArrowUpRight size={14} />
                      </button>
                    ),
                  )}
                </div>
                <label>
                  修改要求
                  <textarea
                    value={request}
                    onChange={(e) => setRequest(e.target.value)}
                    rows={3}
                    placeholder={
                      p.live
                        ? "例如，把活动标题改得更简洁"
                        : "例如，把标题缩小一些"
                    }
                  />
                </label>
                <button
                  className="cs-action cs-highlight"
                  disabled={!request.trim() || !!p.busy}
                  onClick={() =>
                    p.assist(
                      request,
                      selectedId in labels ? (selectedId as Field) : "title",
                    )
                  }
                >
                  <Sparkles />
                  {p.busy || "预览修改建议"}
                </button>
                {!p.live && (
                  <button className="cs-settings" onClick={p.settings}>
                    <Settings2 size={14} /> 服务设置
                  </button>
                )}
              </>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
// Preserve the live SVG elements during pointer selection and drag feedback.

const CoverImage = memo(function CoverImage({ svg }: { svg: string }) {
  return <div className="cs-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
});
