import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Search,
  Sparkles,
  WandSparkles,
  Heart,
  Download,
  Upload,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import {
  scenes,
  scenePrompt,
  refinementDimensions,
  refinePrompt,
  emptyBrand,
  toggleAsset,
  type Asset,
  type Brand,
} from "./creative-model";
import type { Job } from "./chat-model";
import "./creative.css";
import { RevisionModePicker, type RevisionMode } from "./RevisionMode";
export type ToolTab =
  "scenes" | "brief" | "materials" | "refine" | "brand" | "saved";
export type Favorite = { id: string; text: string };
function useToolDraft<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "null") ?? fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [
    value,
    (next: T) => {
      setValue(next);
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {}
    },
  ];
}
export function CreativeTools(p: {
  tab: ToolTab;
  scope: string;
  initialScene?: string | null;
  generate: (text: string, style?: string) => void;
  setTab: (tab: ToolTab) => void;
  draft: string;
  apply: (text: string, style?: string) => void;
  assets: Asset[];
  selected: string[];
  select: (ids: string[]) => void;
  brand: Brand;
  saveBrand: (b: Brand) => void;
  favorites: Favorite[];
  saveFavorites: (f: Favorite[]) => void;
  plan: (text: string, key: string) => Promise<string>;
  canPlan: boolean;
  hasArtwork: boolean;
  busy: boolean;
  backup: () => void;
  restore: (file: File) => Promise<string>;
  onWorking: (value: boolean) => void;
  done: () => void;
}) {
  const key = "posterlab.tools." + p.scope + ".";
  const [scene, setScene] = useToolDraft<string | null>(
      key + "scene",
      p.initialScene || null,
    ),
    [fields, setFields] = useToolDraft<Record<string, string>>(
      key + "fields",
      p.initialScene
        ? { 标题: scenes.find((s) => s.id === p.initialScene)?.title || "" }
        : {},
    );
  const [direction, setDirection] = useToolDraft(
    key + "direction",
    scenes.find((s) => s.id === p.initialScene)?.direction || "",
  );
  const [idea, setIdea] = useToolDraft(key + "idea", p.draft),
    [expanded, setExpanded] = useToolDraft(key + "expanded", "");
  const [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [planKey, setPlanKey] = useToolDraft(
    key + "plan-key",
    crypto.randomUUID(),
  );
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [dimensions, setDimensions] = useToolDraft<Record<string, string>>(
      key + "dimensions",
      {},
    ),
    [note, setNote] = useToolDraft(key + "note", ""),
    [resize, setResize] = useToolDraft(key + "resize", "");
  const [revisionMode, setRevisionMode] = useToolDraft<RevisionMode>(
    key + "revision-mode",
    "redesign",
  );
  const currentScene = scenes.find((s) => s.id === scene);
  const tabs: [ToolTab, string][] = [
    ["scenes", "场景模板"],
    ["brief", "需求助手"],
    ["materials", "素材库"],
    ...(p.hasArtwork ? [["refine", "优化海报"] as [ToolTab, string]] : []),
    ["brand", "品牌偏好"],
    ["saved", "我的收藏"],
  ];
  const usePrompt = (text: string, style?: string) => {
    if (p.busy) return;
    p.apply(text, style);
  };
  return (
    <div className="creative-tools">
      <nav className="tool-tabs" aria-label="创作工具">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            disabled={working}
            className={p.tab === id ? "active" : ""}
            onClick={() => {
              p.setTab(id);
              setError("");
              setNotice("");
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="tool-body">
        {error && (
          <p className="tool-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="tool-notice" role="status">
            {notice}
          </p>
        )}
        {p.tab === "scenes" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">A LITTLE INSPIRATION</span>
              <h3>从一个场景，开始你的创作。</h3>
              <p>
                选择方向，填写关键信息。每次由 AI 重新设计，并非套用固定版式。
              </p>
            </div>
            {!currentScene ? (
              <div className="scene-grid">
                {scenes.map((s) => (
                  <button
                    key={s.id}
                    className={"scene-card scene-" + s.id}
                    onClick={() => {
                      setScene(s.id);
                      setFields({ 标题: s.title });
                      setDirection(s.direction);
                    }}
                    style={{ "--scene-color": s.color } as React.CSSProperties}
                  >
                    <div
                      className="scene-art"
                      style={{
                        backgroundImage: `url(${import.meta.env.BASE_URL}library/${s.background}.png)`,
                      }}
                    >
                      <span>{s.tag}</span>
                      <b>
                        {s.line.split(" / ").map((v) => (
                          <span key={v}>
                            {v}
                            <br />
                          </span>
                        ))}
                      </b>
                      <i>POSTERLAB — CREATIVE STUDY</i>
                    </div>
                    <div className="scene-info">
                      <b>{s.name}</b>
                      <ArrowUpRight size={17} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button className="text-action" onClick={() => setScene(null)}>
                  ← 返回全部场景
                </button>
                <div className="scene-form-head">
                  <span
                    className={"scene-dot scene-" + currentScene.id}
                    style={{ background: currentScene.color }}
                  />
                  <h3>{currentScene.name}</h3>
                  <span>文字均可替换</span>
                </div>
                <div className="field-grid">
                  {["标题", ...currentScene.fields].map((key) => (
                    <label key={key}>
                      {key}
                      {key === "标题" ? " *" : "（可选）"}
                      <input
                        value={fields[key] || ""}
                        maxLength={600}
                        placeholder={
                          key === "标题" ? "海报主标题" : "不填写则省略"
                        }
                        onChange={(e) =>
                          setFields({ ...fields, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                <label className="tool-field">
                  视觉方向
                  <textarea
                    rows={3}
                    value={direction}
                    maxLength={1200}
                    onChange={(e) => setDirection(e.target.value)}
                  />
                </label>
                <button
                  className="tool-primary"
                  disabled={!fields.标题?.trim() || p.busy}
                  onClick={() =>
                    p.generate(
                      scenePrompt(currentScene, fields, direction),
                      currentScene.style,
                    )
                  }
                >
                  生成这张海报 <ArrowUpRight size={17} />
                </button>
                <button
                  className="text-action secondary-draft"
                  disabled={p.busy}
                  onClick={() =>
                    usePrompt(
                      scenePrompt(currentScene, fields, direction),
                      currentScene.style,
                    )
                  }
                >
                  先编辑完整提示词
                </button>
              </>
            )}
          </>
        )}
        {p.tab === "brief" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">FROM IDEA TO ART DIRECTION</span>
              <h3>想法不完整，也没关系。</h3>
              <p>
                先用一句话说清用途。AI
                会补充视觉方向与排版建议，你确认之后再生成海报。
              </p>
            </div>
            <div className="brief-steps">
              <span className="active">01 简单描述</span>
              <i />
              <span className={expanded ? "active" : ""}>02 确认提示词</span>
              <i />
              <span>03 发送生成</span>
            </div>
            <label className="tool-field">
              你想做什么？
              <textarea
                rows={4}
                maxLength={5000}
                value={idea}
                disabled={working}
                placeholder="例如：下周咖啡店办读书会，想吸引附近的年轻人，风格温暖一点。"
                onChange={(e) => {
                  setIdea(e.target.value);
                  setPlanKey(crypto.randomUUID());
                }}
              />
            </label>
            <button
              className="tool-primary"
              disabled={!idea.trim() || working || !p.canPlan || p.busy}
              onClick={async () => {
                setWorking(true);
                p.onWorking(true);
                setError("");
                try {
                  setExpanded(await p.plan(idea, planKey));
                  setPlanKey(crypto.randomUUID());
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setWorking(false);
                  p.onWorking(false);
                }
              }}
            >
              {working ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <WandSparkles size={17} />
              )}{" "}
              {working ? "AI 正在整理你的想法…" : "AI 帮我完善提示词"}
            </button>
            <p className="tool-footnote">
              这一步调用 AI
              整理需求，产生少量模型费用，不会生成海报。未提供的日期、价格等需要你确认。
            </p>
            {expanded && (
              <div className="expanded-brief">
                <label className="tool-field">
                  <span>
                    <Sparkles size={16} /> 已整理 · 可以继续编辑
                  </span>
                  <textarea
                    rows={12}
                    maxLength={8000}
                    value={expanded}
                    onChange={(e) => setExpanded(e.target.value)}
                  />
                </label>
                <button
                  className="tool-primary"
                  disabled={!expanded.trim() || working || p.busy}
                  onClick={() =>
                    p.generate(
                      "请按以下确认的需求生成海报。未确认的事实省略，不编造。\n" +
                        expanded,
                    )
                  }
                >
                  按这个方案生成海报 <ArrowUpRight size={17} />
                </button>
              </div>
            )}
          </>
        )}
        {p.tab === "materials" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">THE CREATIVE SHELF</span>
              <h3>给想法一点视觉灵感。</h3>
              <p>
                选择的素材会真实交给 AI 排版并渲染到海报中。最多 6 项，含 1
                张背景；选择新背景会替换旧背景。
              </p>
            </div>
            <div className="library-bar">
              <label className="library-search">
                <Search size={17} />
                <input
                  aria-label="搜索素材"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索咖啡、音乐、自然…"
                />
              </label>
              <select
                aria-label="素材类型"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部素材</option>
                <option value="background">原创背景</option>
                <option value="icon">图标</option>
              </select>
            </div>
            <div className="library-selected">
              <span>已选 {p.selected.length} / 6</span>
              <button
                disabled={!p.selected.length || p.busy}
                onClick={() => p.select([])}
              >
                清空选择
              </button>
            </div>
            <div className="asset-grid">
              {p.assets
                .filter(
                  (a) =>
                    (filter === "all" || a.kind === filter) &&
                    `${a.name} ${a.tags}`.includes(query),
                )
                .map((a) => (
                  <div
                    key={a.id}
                    className={
                      "asset-card " +
                      (p.selected.includes(a.id) ? "selected" : "")
                    }
                  >
                    <button
                      className={
                        "asset-preview " + (a.tone === "ivory" ? "dark" : "")
                      }
                      disabled={p.busy}
                      aria-label={
                        (p.selected.includes(a.id)
                          ? "取消素材："
                          : "选择素材：") + a.name
                      }
                      aria-pressed={p.selected.includes(a.id)}
                      onClick={() => {
                        try {
                          p.select(toggleAsset(p.selected, a, p.assets));
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <img src={a.preview} alt={a.name} loading="lazy" />
                      <span>
                        {p.selected.includes(a.id) ? <Check size={16} /> : "+"}
                      </span>
                    </button>
                    <b>{a.name}</b>
                    <a href={a.license_url} target="_blank" rel="noreferrer">
                      {a.source} · 授权 ↗
                    </a>
                  </div>
                ))}
            </div>
            {!p.assets.length && <p>素材库暂未加载，请关闭工具后重试连接。</p>}
            <div className="sticky-tool-action">
              <span>已选 {p.selected.length} 项 · 已自动应用</span>
              <button className="tool-primary" onClick={p.done}>
                完成选择，返回对话 <Check size={16} />
              </button>
            </div>
            <p className="tool-footnote">
              24 款双色 Lucide 图标（ISC / MIT）与 8
              张原创背景（CC0）。源文件包附带授权说明。
              <a
                href="https://lucide.dev/icons/"
                target="_blank"
                rel="noreferrer"
              >
                浏览 Lucide ↗
              </a>{" "}
              ·{" "}
              <a
                href="https://heropatterns.com/"
                target="_blank"
                rel="noreferrer"
              >
                发现 Hero Patterns（CC BY 4.0，需署名）↗
              </a>
              。外部网站仅作灵感参考，未自动导入其素材。
            </p>
          </>
        )}
        {p.tab === "refine" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">MAKE IT MORE YOU</span>
              <h3>让下一版，更接近你的想法。</h3>
              <p>
                只选你想改变的维度，也可以直接写意见。未要求修改的事实会保留，旧版本可以随时查看。
              </p>
            </div>
            <RevisionModePicker
              value={revisionMode}
              onChange={setRevisionMode}
            />
            <div className="refinement-groups">
              {refinementDimensions.map((d) => (
                <fieldset key={d.label}>
                  <legend>{d.label}</legend>
                  <div>
                    {d.choices.map((v) => (
                      <button
                        key={v}
                        className={dimensions[d.label] === v ? "chosen" : ""}
                        aria-pressed={dimensions[d.label] === v}
                        onClick={() =>
                          setDimensions({
                            ...dimensions,
                            [d.label]: dimensions[d.label] === v ? "" : v,
                          })
                        }
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <label className="tool-field">
              顺便适配尺寸
              <select
                value={resize}
                onChange={(e) => setResize(e.target.value)}
              >
                <option value="">保持当前尺寸</option>
                <option>竖版 1080 × 1440</option>
                <option>方图 1080 × 1080</option>
                <option>横版 1920 × 1080</option>
              </select>
            </label>
            <label className="tool-field">
              你的其他意见
              <textarea
                rows={3}
                maxLength={3000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：品牌色改为 #4F46E5，日期改成 11 月 12 日…"
              />
            </label>
            <div className="sticky-tool-action">
              <span>
                {Object.values(dimensions).filter(Boolean).length} 个优化方向 ·
                可反复迭代
              </span>
              <button
                className="tool-primary"
                disabled={
                  !refinePrompt(dimensions, note, resize, revisionMode) ||
                  p.busy
                }
                onClick={() =>
                  p.generate(
                    refinePrompt(dimensions, note, resize, revisionMode),
                  )
                }
              >
                生成优化版本 <ArrowUpRight size={17} />
              </button>
            </div>
          </>
        )}
        {p.tab === "brand" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">YOUR BRAND, REMEMBERED</span>
              <h3>让每次创作，都保持一致。</h3>
              <p>
                保存在当前浏览器，启用后会随下一条消息交给
                AI。本次明确的要求优先。
              </p>
            </div>
            <label className="brand-toggle">
              <input
                type="checkbox"
                checked={p.brand.enabled}
                onChange={(e) =>
                  p.saveBrand({ ...p.brand, enabled: e.target.checked })
                }
              />
              <span>在创作中使用品牌偏好</span>
            </label>
            <div className="field-grid">
              {(
                [
                  ["name", "品牌名称", "例如：山间咖啡"],
                  ["color", "品牌色", "例如：森林绿 #315449、奶油白"],
                  ["voice", "品牌语气", "例如：自然、温暖、克制"],
                  ["audience", "目标受众", "例如：附近的年轻人"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={200}
                    value={p.brand[key]}
                    onChange={(e) =>
                      p.saveBrand({ ...p.brand, [key]: e.target.value })
                    }
                    placeholder={placeholder}
                  />
                </label>
              ))}
            </div>
            <p className="tool-notice">自动保存 · 不需要每次重新介绍你的品牌</p>
            <button
              className="text-action"
              onClick={() => p.saveBrand(emptyBrand)}
            >
              重置品牌偏好
            </button>
          </>
        )}
        {p.tab === "saved" && (
          <>
            <div className="tool-intro">
              <span className="eyebrow">KEEP THE GOOD IDEAS</span>
              <h3>好用的提示词，下次接着用。</h3>
              <p>
                收藏当前输入框中的文字，作为自己的提示词库。使用时可以先替换关键信息。
              </p>
            </div>
            <button
              className="tool-primary"
              disabled={!p.draft.trim()}
              onClick={() => {
                if (!p.favorites.some((f) => f.text === p.draft)) {
                  p.saveFavorites([
                    { id: crypto.randomUUID(), text: p.draft },
                    ...p.favorites,
                  ]);
                }
                setNotice("已收藏当前提示词");
              }}
            >
              <Heart size={16} /> 收藏当前输入
            </button>
            <div className="favorite-list">
              {p.favorites.map((f) => (
                <article key={f.id}>
                  <p>{f.text}</p>
                  <div>
                    <button disabled={p.busy} onClick={() => usePrompt(f.text)}>
                      带入对话 <ArrowUpRight size={15} />
                    </button>
                    <button
                      aria-label="删除这条收藏"
                      onClick={() =>
                        p.saveFavorites(
                          p.favorites.filter((x) => x.id !== f.id),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!p.favorites.length && (
              <p className="tool-footnote">
                还没有收藏。在主输入框写下提示词，再回这里收藏。
              </p>
            )}
            <div className="backup-panel">
              <h4>对话备份</h4>
              <p>
                导出当前浏览器的对话文字与版本引用。海报图片和品牌偏好不包含在备份中；跨设备恢复图片需另行迁移本机作品文件。
              </p>
              <button onClick={p.backup}>
                <Download size={16} /> 导出对话
              </button>
              <label>
                <Upload size={16} /> 导入对话
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={p.busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setNotice("");
                    setError("");
                    try {
                      setNotice(await p.restore(file));
                      setError("");
                    } catch {
                      setError(
                        "备份格式不正确或文件过大，请选择 PosterLab 导出的 JSON 文件。",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export function VersionCompare({ jobs }: { jobs: Job[] }) {
  const [left, setLeft] = useState(jobs.at(-2)?.id || jobs[0]?.id),
    [right, setRight] = useState(jobs.at(-1)?.id);
  return (
    <>
      <p className="dialog-copy">
        对照构图、文字与色彩；关闭后可在画布底部切换版本，继续优化任意一版。
      </p>
      <div className="version-compare">
        {([left, right] as const).map((id, i) => (
          <div key={i}>
            <select
              aria-label={i ? "右侧对比版本" : "左侧对比版本"}
              value={id}
              onChange={(e) => (i ? setRight : setLeft)(e.target.value)}
            >
              {jobs.map((j, k) => (
                <option key={j.id} value={j.id}>
                  版本 {k + 1}
                  {k === jobs.length - 1 ? " · 最新" : ""}
                </option>
              ))}
            </select>
            <img
              src={jobs.find((j) => j.id === id)?.image_url}
              alt={i ? "右侧海报版本" : "左侧海报版本"}
            />
          </div>
        ))}
      </div>
    </>
  );
}
