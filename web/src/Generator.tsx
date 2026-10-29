import { studioFetch, STATIC_DEMO, DEMO_MESSAGE } from "./studio-api";
import React, { useEffect, useRef, useState, useId } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Plus,
  PanelLeft,
  Download,
  X,
  SlidersHorizontal,
  Sparkles,
  LoaderCircle,
  Check,
  ChevronDown,
  MessageSquare,
  Maximize2,
  MoreHorizontal,
  ArrowLeft,
  LayoutTemplate,
  WandSparkles,
  Images,
  Palette,
  GitCompareArrows,
  Zap,
  ScanLine,
  ChevronsRight,
} from "lucide-react";
import {
  type Job,
  type Turn,
  type Conversation,
  historyFor,
  importLegacy,
  titleFrom,
} from "./chat-model";
import "./generator.css";
import {
  CreativeTools,
  VersionCompare,
  type ToolTab,
  type Favorite,
} from "./CreativeTools";
import {
  type Asset,
  type Brand,
  emptyBrand,
  brandContext,
  parseBackup,
} from "./creative-model";

import { EvaluationPanel, type Review } from "./EvaluationPanel";
import "./studio-next.css";
import {
  ModelPicker,
  defaultPreferences,
  type ModelCatalog,
  type ModelPreferences,
} from "./ModelPicker";

type Style = { id: string; name: string; prompt: string };
type Service = {
  ai: boolean;
  model: string;
  design_model?: string;
  vision_model?: string;
  budget: number;
  spent: number;
  reserved: number;
};
type Packet = {
  key: string;
  threadId: string;
  body: {
    model?: string;
    design_model?: string;
    messages: { role: string; content: string }[];
    current_id?: string;
    asset_ids?: string[];
    style: string;
    format: string;
  };
};
const STORE = "posterlab.chat.v1";
const phase: Record<string, string> = {
  queued: "正在准备画布",
  designing: "正在设计海报",
  checking: "正在核对文字与布局",
  rendering: "正在渲染海报",
};
function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  let r: Response;
  try {
    r = await studioFetch(path, {
      method: body ? "POST" : "GET",
      headers: body
        ? { "Content-Type": "application/json", "Idempotency-Key": key! }
        : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Error("暂时无法连接服务。你的消息已保留，可以重试。");
  }
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("无法连接本地 AI 服务，请启动服务后重新连接。");
  }
  if (!r.ok)
    throw new ApiError(
      typeof data.detail === "string"
        ? data.detail
        : "消息内容不符合要求，请精简后再试。",
      r.status,
    );
  return data;
}
function Dialog({
  wide = false,
  title,
  close,
  children,
}: {
  title: string;
  wide?: boolean;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={"pl-dialog " + (wide ? "wide-dialog" : "")}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function ReplyText({ text }: { text: string }) {
  return (
    <p>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </p>
  );
}
export default function Generator() {
  const [initialScene, setInitialScene] = useState<string | null>(null);
  const [reviewScores, setReviewScores] = useState<Record<string, number>>({});
  const [reviewTarget, setReviewTarget] = useState<Job | null>(null);
  const [newJobId, setNewJobId] = useState<string | null>(null);
  const followScroll = useRef(true);
  const [toolTab, setToolTab] = useState<ToolTab>("scenes");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetIds, setAssetIds] = useState<string[]>(() =>
    load("posterlab.creative.assets", []),
  );
  const [brand, setBrand] = useState<Brand>(() =>
    load("posterlab.creative.brand", emptyBrand),
  );
  const [favorites, setFavorites] = useState<Favorite[]>(() =>
    load("posterlab.creative.favorites", []),
  );
  const [motion, setMotion] = useState<boolean>(() =>
    load("posterlab.creative.motion", true),
  );
  const [planning, setPlanning] = useState(false);
  const [modelPreferences, setModelPreferences] = useState<ModelPreferences>(
    () => ({
      ...defaultPreferences,
      ...load("posterlab.models", defaultPreferences),
    }),
  );
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [threads, setThreads] = useState<Conversation[]>(() => load(STORE, []));
  const [threadId, setThreadId] = useState<string | null>(() =>
    load("posterlab.chat.current", null),
  );
  const [draft, setDraft] = useState(() => load("posterlab.chat.draft", ""));
  const [jobs, setJobs] = useState<Job[]>([]),
    [styles, setStyles] = useState<Style[]>([]),
    [service, setService] = useState<Service | null>(null);
  const reviewModel =
    modelPreferences.review ||
    modelCatalog?.defaults.review ||
    service?.vision_model ||
    "step-5-preview";
  const [style, setStyle] = useState("auto"),
    [format, setFormat] = useState("portrait");
  const [pending, setPending] = useState<Packet | null>(() =>
    load("posterlab.chat.pending", null),
  );
  const [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState("");
  const [sidebar, setSidebar] = useState(false),
    [canvas, setCanvas] = useState(true),
    [mobileTab, setMobileTab] = useState<"chat" | "canvas">("chat");
  const [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<
      | "options"
      | "details"
      | "preview"
      | "service"
      | "creative"
      | "compare"
      | "evaluate"
      | null
    >(null),
    [source, setSource] = useState("");
  const [search, setSearch] = useState(""),
    [ready, setReady] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null),
    end = useRef<HTMLDivElement>(null),
    requestLock = useRef(false);
  const thread = threads.find((t) => t.id === threadId);
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const threadJobs = (thread?.messages || []).flatMap((m) =>
    m.jobId && jobMap.has(m.jobId) ? [jobMap.get(m.jobId)!] : [],
  );
  const completed = threadJobs.filter((j) => j.state === "complete");
  const artwork = completed.find((j) => j.id === selected) || completed.at(-1);
  const active = threadJobs.find(
    (j) => !["complete", "failed"].includes(j.state),
  );
  const anyActive = threads.some((t) =>
    t.messages.some(
      (m) =>
        m.jobId &&
        jobMap.has(m.jobId) &&
        !["complete", "failed"].includes(jobMap.get(m.jobId)!.state),
    ),
  );
  const busy = sending || anyActive || planning;
  const hasCanvas = !!artwork || !!active;
  const split = hasCanvas && canvas;
  function save(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setStorageError(
        "浏览器存储已满，对话暂时无法保存。海报仍保存在本机服务中。",
      );
    }
  }
  function updateThreads(fn: (old: Conversation[]) => Conversation[]) {
    setThreads((old) => {
      const next = fn(old);
      save(STORE, next);
      return next;
    });
  }
  async function refresh() {
    try {
      const [s, p, j, a, m] = await Promise.all([
        api<Service>("/status"),
        api<{ styles: Style[] }>("/styles"),
        api<Job[]>("/generations"),
        api<{ assets: Asset[] }>("/assets"),
        api<ModelCatalog>("/models"),
      ]);
      setService(s);
      setModelCatalog(m);
      setStyles(p.styles);
      setJobs(j);
      setAssets(a.assets);
      updateThreads((old) =>
        old.map((t) => {
          const first = t.messages
            .map((m) => j.find((job) => job.id === m.jobId))
            .find(Boolean);
          return first ? { ...t, title: titleFrom(first.brief) } : t;
        }),
      );
      setReady(true);
      if (STATIC_DEMO && !threadId && j.length) {
        const example = importLegacy(j)[0];
        updateThreads((old) =>
          old.some((t) => t.id === example.id) ? old : [...old, example],
        );
        setThreadId(example.id);
      }
      if (!load<boolean>("posterlab.chat.imported", false)) {
        updateThreads((old) => [
          ...old,
          ...importLegacy(j).filter((t) => !old.some((o) => o.id === t.id)),
        ]);
        save("posterlab.chat.imported", true);
      }
    } catch (e) {
      setError((e as Error).message);
      setReady(true);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    save("posterlab.chat.current", threadId);
    setSelected(null);
    setMobileTab("chat");
  }, [threadId]);
  useEffect(() => {
    save("posterlab.chat.draft", draft);
    const el = textarea.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 180) + "px";
    }
  }, [draft, threadId]);
  useEffect(() => {
    save("posterlab.chat.pending", pending);
  }, [pending]);
  useEffect(() => {
    if (!anyActive) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const j = await api<Job[]>("/generations");
        if (!stopped) {
          setJobs(j);
          setError("");
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(poll, 1800);
    }
    timer = setTimeout(poll, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [anyActive]);
  useEffect(() => {
    if (followScroll.current)
      end.current?.scrollIntoView({
        block: "end",
        behavior: motion ? "smooth" : "instant",
      });
  }, [
    thread?.messages.length,
    threadId,
    sending,
    active?.state,
    threadJobs.length,
    mobileTab,
  ]);
  useEffect(() => {
    if (hasCanvas) setCanvas(true);
  }, [hasCanvas]);
  useEffect(() => {
    if (artwork?.id) {
      setCanvas(true);
      if (!draft.trim()) setMobileTab("canvas");
    }
  }, [artwork?.id]);
  useEffect(() => {
    save("posterlab.creative.assets", assetIds);
  }, [assetIds]);
  useEffect(() => {
    if (artwork) {
      setAssetIds(artwork.asset_ids || []);
      setFormat(artwork.format);
    }
  }, [artwork?.id]);
  useEffect(() => {
    if (newJobId && jobs.find((j) => j.id === newJobId)?.state === "complete") {
      setSelected(newJobId);
      setNewJobId(null);
    }
  }, [jobs, newJobId]);
  function rememberDraft() {
    save("posterlab.draft." + (threadId || "new"), draft);
  }
  function showTools(tab: ToolTab, sceneId?: string) {
    setInitialScene(sceneId || null);
    if (sceneId) {
      const prefix =
        "posterlab.tools." +
        (threadId || "new") +
        ":" +
        (artwork?.id || "none") +
        ".";
      try {
        for (const field of ["scene", "fields", "direction"])
          sessionStorage.removeItem(prefix + field);
      } catch {}
    }
    setToolTab(tab);
    setModal("creative");
  }
  function applyPrompt(text: string, preset?: string) {
    setDraft(text);
    if (preset) setStyle(preset);
    setModal(null);
    setMobileTab("chat");
    setTimeout(() => textarea.current?.focus(), 0);
  }
  function backup() {
    const blob = new Blob(
      [JSON.stringify({ version: 1, conversations: threads }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "posterlab-conversations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restore(file: File) {
    if (file.size > 10_000_000) throw Error("备份过大");
    const imported = parseBackup(await file.text());
    updateThreads((old) => {
      const ids = new Set(old.map((t) => t.id));
      const added = imported.filter((t) => {
        if (ids.has(t.id)) return false;
        ids.add(t.id);
        return true;
      });
      return [...added, ...old];
    });
    return `已读取 ${imported.length} 个对话，按 ID 合并；已有对话保持原样。`;
  }
  function fresh() {
    rememberDraft();
    setThreadId(null);
    setDraft(threadId ? load("posterlab.draft.new", "") : "");
    setSelected(null);
    setSidebar(false);
    setError("");
    setStyle("auto");
    setAssetIds([]);
    setFormat("portrait");
    setTimeout(() => textarea.current?.focus(), 0);
  }
  function open(t: Conversation) {
    rememberDraft();
    setThreadId(t.id);
    setDraft(load("posterlab.draft." + t.id, ""));
    setSidebar(false);
    setCanvas(true);
    setError("");
    const last = t.messages
      .flatMap((m) =>
        m.jobId && jobMap.get(m.jobId) ? [jobMap.get(m.jobId)!] : [],
      )
      .at(-1);
    setFormat(last?.format || "portrait");
    setAssetIds(last?.asset_ids || []);
    setStyle("auto");
  }
  function ingestJob(job: Job, content: string) {
    const id = thread?.id || crypto.randomUUID(),
      time = new Date().toISOString();
    const additions: Turn[] = [
      { id: crypto.randomUUID(), role: "user", content },
      {
        id: job.id + "-reply",
        role: "assistant",
        content: "正在根据你选中的评测建议设计新版，原作已保留。",
        jobId: job.id,
      },
    ];
    updateThreads((old) =>
      thread
        ? old.map((t) =>
            t.id === id
              ? { ...t, messages: [...t.messages, ...additions], updated: time }
              : t,
          )
        : [
            {
              id,
              title: titleFrom(content),
              created: time,
              updated: time,
              messages: additions,
            },
            ...old,
          ],
    );
    setThreadId(id);
    setJobs((old) => [job, ...old.filter((j) => j.id !== job.id)]);
    setNewJobId(job.id);
    setCanvas(true);
    setModal(null);
    followScroll.current = true;
  }
  async function send(retry = false, text = draft, preset = style) {
    if (STATIC_DEMO) {
      setError(DEMO_MESSAGE);
      return;
    }
    if (requestLock.current || busy || (!retry && !text.trim())) return;
    requestLock.current = true;
    setSending(true);
    setError("");
    followScroll.current = true;
    let packet = pending;
    if (!retry) {
      const content = text.trim();
      const id = thread?.id || crypto.randomUUID();
      const time = new Date().toISOString();
      const message: Turn = { id: crypto.randomUUID(), role: "user", content };
      const previous = thread?.messages || [];
      const messages =
        previous.at(-1)?.role === "user" && previous.at(-1)?.content === content
          ? previous
          : [...previous, message];
      updateThreads((old) =>
        thread
          ? old.map((t) =>
              t.id === id ? { ...t, messages, updated: time } : t,
            )
          : [
              {
                id,
                title: titleFrom(content),
                created: time,
                updated: time,
                messages,
              },
              ...old,
            ],
      );
      setThreadId(id);
      setDraft("");
      save("posterlab.draft." + (threadId || "new"), "");
      setModal(null);
      packet = {
        key: crypto.randomUUID(),
        threadId: id,
        body: {
          model: modelPreferences.chat || modelCatalog?.defaults.chat,
          design_model:
            modelPreferences.design || modelCatalog?.defaults.design,
          messages: historyFor(messages).map((m, i, all) =>
            i === all.length - 1
              ? { ...m, content: m.content + brandContext(brand) }
              : m,
          ),
          asset_ids: assetIds,
          current_id: artwork?.id,
          style: preset,
          format,
        },
      };
      setPending(packet);
      save("posterlab.chat.pending", packet);
    }
    if (!packet) {
      setSending(false);
      requestLock.current = false;
      return;
    }
    if (retry) setThreadId(packet.threadId);
    try {
      const response = await api<{ reply: string; job: Job | null }>(
        "/chat",
        packet.body,
        packet.key,
      );
      const target = packet.threadId;
      updateThreads((old) =>
        old.map((t) =>
          t.id === target &&
          !t.messages.some((m) => m.id === packet!.key + "-reply")
            ? {
                ...t,
                updated: new Date().toISOString(),
                messages: [
                  ...t.messages,
                  {
                    id: packet!.key + "-reply",
                    role: "assistant",
                    content: response.job
                      ? "正在根据你的需求设计海报，完成后会显示在画布中。"
                      : response.reply,
                    jobId: response.job?.id,
                  },
                ],
              }
            : t,
        ),
      );
      if (response.job) {
        updateThreads((old) =>
          old.map((t) =>
            t.id === packet!.threadId
              ? { ...t, title: titleFrom(response.job!.brief) }
              : t,
          ),
        );
        setNewJobId(response.job.id);
        setJobs((old) => [
          response.job!,
          ...old.filter((j) => j.id !== response.job!.id),
        ]);
        setCanvas(true);
        setFormat(response.job.format);
      }
      setPending(null);
      save("posterlab.chat.pending", null);
    } catch (e) {
      setError((e as Error).message);
      if (
        e instanceof ApiError &&
        [400, 402, 413, 422, 502, 503].includes(e.status)
      ) {
        setPending(null);
        save("posterlab.chat.pending", null);
        setDraft(packet.body.messages.at(-1)?.content || "");
      }
    } finally {
      requestLock.current = false;
      setSending(false);
    }
  }
  async function retryRender(job: Job) {
    if (requestLock.current) return;
    requestLock.current = true;
    try {
      const next = await api<Job>("/generations/" + job.id + "/rerender", {});
      setJobs((old) => old.map((j) => (j.id === next.id ? next : j)));
      setNewJobId(next.id);
      setCanvas(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      requestLock.current = false;
    }
  }
  async function details() {
    setModal("details");
    setSource("");
    if (artwork)
      try {
        const data = await api<{ html: string }>(
          "/generations/" + artwork.id + "/source",
        );
        setSource(data.html);
      } catch (e) {
        setSource((e as Error).message);
      }
  }
  const composer = (
    <div className="composer-wrap">
      {error && (
        <div className="chat-error" role="alert">
          {error}
          {!service?.ai && !STATIC_DEMO && (
            <button
              onClick={() => {
                setError("");
                refresh();
              }}
            >
              重新连接
            </button>
          )}
        </div>
      )}
      {pending && !sending && (
        <div className="pending-note">
          有一条消息尚未确认。点击「重试发送」恢复原请求。
          <button
            onClick={() => {
              setPending(null);
              setError("");
            }}
          >
            取消这次发送
          </button>
        </div>
      )}
      <div className="composer-tools">
        <button
          disabled={busy || !!pending}
          onClick={() => showTools("scenes")}
        >
          <LayoutTemplate size={15} />
          场景模板
        </button>
        <button
          disabled={busy || !!pending}
          onClick={() => showTools(artwork ? "refine" : "brief")}
        >
          {artwork ? <Palette size={15} /> : <WandSparkles size={15} />}{" "}
          {artwork ? "优化海报" : "需求助手"}
        </button>
        <button
          disabled={busy || !!pending}
          onClick={() => showTools("materials")}
        >
          <Images size={15} />
          素材库{assetIds.length > 0 && <b>{assetIds.length}</b>}
        </button>
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(!!pending);
        }}
      >
        {(assetIds.length > 0 || brand.enabled) && (
          <div className="attached-materials">
            {assetIds.map((id) => {
              const a = assets.find((x) => x.id === id);
              return a ? (
                <button
                  type="button"
                  key={id}
                  disabled={busy || !!pending}
                  onClick={() => setAssetIds(assetIds.filter((x) => x !== id))}
                  aria-label={"移除素材：" + a.name}
                >
                  <img src={a.preview} alt="" />
                  {a.name}
                  <X size={12} />
                </button>
              ) : null;
            })}
            {brand.enabled && (
              <button type="button" onClick={() => showTools("brand")}>
                <Palette size={13} />
                品牌偏好已启用
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textarea}
          aria-label="发送给 PosterLab 的消息"
          placeholder={
            artwork
              ? "继续说你的想法，例如：标题再大一些，日期改为…"
              : "描述你想做的海报，或先问我一个设计问题…"
          }
          rows={2}
          maxLength={8500}
          value={draft}
          disabled={!!pending || busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send(!!pending);
            }
          }}
        />
        <div className="composer-bottom">
          <button
            className="preferences"
            type="button"
            onClick={() => setModal("options")}
            disabled={busy || !!pending}
          >
            <SlidersHorizontal size={16} />
            <span>创作偏好</span>
            {style !== "auto" && <i />}
          </button>
          <button
            className="send-button"
            type="submit"
            disabled={
              busy ||
              (!pending && !draft.trim()) ||
              (!service?.ai && !STATIC_DEMO)
            }
            aria-label={
              busy ? "AI 正在处理" : pending ? "重试发送" : "发送消息，交给 AI"
            }
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <ArrowUp size={19} />
            )}
            <span>
              {busy
                ? "处理中"
                : pending
                  ? "重试发送"
                  : artwork
                    ? "发送修改"
                    : "发送创意"}
            </span>
          </button>
        </div>
      </form>
      <p className="composer-hint">
        {STATIC_DEMO
          ? "展示模式 · 查看真实案例；实时生成请运行完整版"
          : !ready
            ? "正在连接 AI…"
            : !service?.ai
              ? "AI 服务未连接，请检查本机服务配置。"
              : busy
                ? "AI 正在处理，你可以查看对话与画布。"
                : "Enter 发送 · Shift + Enter 换行"}
        {artwork && !STATIC_DEMO && " · 对话将修改当前画布版本"}
      </p>
    </div>
  );
  return (
    <div
      className={
        "chat-app " +
        (motion ? "" : "motion-off ") +
        (split ? "with-canvas " : "") +
        (sidebar ? "sidebar-open" : "")
      }
    >
      <div className="ambient-lights" aria-hidden="true">
        <i />
        <i />
        <i />
        <div />
      </div>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="收起对话列表"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className="chat-sidebar" aria-label="对话列表">
        <div className="sidebar-brand">
          <span className="brand-symbol">✳</span>
          <b>PosterLab</b>
          <button
            className="icon-button"
            aria-label="收起侧栏"
            onClick={() => setSidebar(false)}
          >
            <PanelLeft size={19} />
          </button>
        </div>
        <button className="new-chat" onClick={fresh}>
          <Plus size={18} />
          新对话
        </button>
        <input
          className="thread-search"
          aria-label="搜索对话"
          placeholder="搜索对话"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="thread-list">
          <p>最近的对话</p>
          {[...threads]
            .sort((a, b) => b.updated.localeCompare(a.updated))
            .filter((t) => t.title.includes(search))
            .map((t) => (
              <button
                key={t.id}
                className={threadId === t.id ? "current" : ""}
                onClick={() => open(t)}
                title={t.title}
              >
                <MessageSquare size={15} />
                <span>{t.title}</span>
              </button>
            ))}
          {!threads.length && <small>你的创作会保存在这里</small>}
        </div>
        <div className="sidebar-bottom">
          <button
            onClick={() => {
              setSidebar(false);
              showTools("saved");
            }}
          >
            <Palette size={16} />
            <span>收藏与品牌工具</span>
            <ArrowUpRight size={15} />
          </button>
          <button onClick={() => setModal("service")}>
            <span className={"status-dot " + (service?.ai ? "online" : "")} />
            <span>
              {STATIC_DEMO
                ? "展示版说明"
                : service?.ai
                  ? "AI 已连接"
                  : "连接设置"}
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>
      <div className="chat-main">
        {STATIC_DEMO && (
          <aside className="demo-banner" aria-label="展示模式">
            <span>
              <b>GitHub Pages 展示版</b> · 真实彩排案例，非实时
              AI。可查看对比、评测和下载。
            </span>
            <a
              href="https://github.com/gjn12-31/posterlab#安装与启动"
              target="_blank"
              rel="noreferrer"
            >
              运行完整 AI 版 ↗
            </a>
          </aside>
        )}
        <header className="chat-topbar">
          <div>
            <button
              className="icon-button"
              aria-label="打开对话列表"
              onClick={() => setSidebar(!sidebar)}
            >
              <PanelLeft size={20} />
            </button>
            <button className="wordmark" onClick={fresh}>
              PosterLab <span>创作助手</span>
            </button>
          </div>
          <div>
            <button
              className="motion-toggle"
              aria-label={motion ? "关闭动态效果" : "开启动效"}
              aria-pressed={motion}
              onClick={() => {
                setMotion(!motion);
                save("posterlab.creative.motion", !motion);
              }}
            >
              <Zap size={15} />
              <span>{motion ? "动效开启" : "动效关闭"}</span>
            </button>
            <button className="top-new" onClick={fresh}>
              <Plus size={17} />
              <span>新对话</span>
            </button>
            {hasCanvas && (
              <button
                className="open-canvas"
                onClick={() => {
                  setCanvas(!canvas);
                  setMobileTab("canvas");
                }}
              >
                {canvas ? "收起画布" : "打开画布"}
              </button>
            )}
          </div>
        </header>
        {hasCanvas && (
          <nav className="mobile-tabs">
            <button
              className={mobileTab === "chat" ? "selected" : ""}
              onClick={() => setMobileTab("chat")}
            >
              对话
            </button>
            <button
              className={mobileTab === "canvas" ? "selected" : ""}
              onClick={() => {
                setCanvas(true);
                setMobileTab("canvas");
              }}
            >
              画布{active && <span className="tab-dot" />}
            </button>
          </nav>
        )}
        <div className="conversation-layout">
          <main
            className={
              "conversation " +
              (!thread?.messages.length ? "empty " : "") +
              (mobileTab === "canvas" && hasCanvas ? "mobile-hidden" : "")
            }
          >
            {!thread?.messages.length ? (
              <div className="welcome">
                <div className="welcome-icon">
                  <Sparkles size={31} />
                </div>
                <p className="welcome-kicker">
                  <span /> AN IDEA. A POSTER. A BETTER VERSION.
                </p>
                <h1>
                  好想法，
                  <br />
                  <em>值得被看见。</em>
                </h1>
                <p className="welcome-copy">
                  从一句灵感到原创设计，看图评测，再大胆改版。
                </p>
                {composer}
                <div className="inspiration-strip" aria-label="场景灵感">
                  {[
                    {
                      name: "周末咖啡市集",
                      tag: "WARM & EDITORIAL",
                      bg: "paper",
                    },
                    {
                      name: "午夜音乐现场",
                      tag: "BOLD & ELECTRIC",
                      bg: "noir",
                    },
                    {
                      name: "新灵感发布",
                      tag: "LIGHT & FUTURISTIC",
                      bg: "aurora",
                    },
                  ].map((item, i) => (
                    <button
                      key={item.bg}
                      className={"inspiration-card inspiration-" + i}
                      onClick={() =>
                        showTools("scenes", ["coffee", "music", "launch"][i])
                      }
                    >
                      <div
                        style={{
                          backgroundImage: `url(${import.meta.env.BASE_URL}library/${item.bg}.png)`,
                        }}
                      >
                        <span>0{i + 1}</span>
                        <b>{item.name}</b>
                        <i>{item.tag}</i>
                        <ArrowUpRight size={19} />
                      </div>
                    </button>
                  ))}
                </div>
                <div className="welcome-bottom">
                  <span>01 描述创意　→　02 生成海报　→　03 评测优化</span>
                  <button onClick={() => showTools("saved")}>
                    我的创作工具 <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="message-scroll"
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    followScroll.current =
                      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
                  }}
                >
                  <div className="messages">
                    {thread.messages.map((m) => {
                      const j = m.jobId ? jobMap.get(m.jobId) : undefined;
                      return (
                        <article className={"message " + m.role} key={m.id}>
                          {m.role === "assistant" && (
                            <span className="assistant-mark">
                              <Sparkles size={18} />
                            </span>
                          )}
                          <div className="message-body">
                            {m.role === "assistant" ? (
                              <ReplyText
                                text={
                                  j &&
                                  m.content.startsWith("正在") &&
                                  j.state === "complete"
                                    ? "海报已生成，点击预览查看；可以继续提出修改意见或进行 AI 评测。"
                                    : m.content
                                }
                              />
                            ) : m.content.length > 320 ? (
                              <details className="message-brief">
                                <summary>
                                  {m.content.slice(0, 70)}…{" "}
                                  <span>展开完整需求</span>
                                </summary>
                                <p>{m.content}</p>
                              </details>
                            ) : (
                              <p>{m.content}</p>
                            )}
                            {j &&
                              (j.state === "complete" ? (
                                <button
                                  className="artifact-link"
                                  onClick={() => {
                                    setSelected(j.id);
                                    setCanvas(true);
                                    setMobileTab("canvas");
                                  }}
                                >
                                  <img src={j.image_url} alt="海报缩略图" />
                                  <span>
                                    <b>{j.style_name}海报</b>
                                    <small>已完成 · 点击在画布中查看</small>
                                  </span>
                                  <ArrowUpRight size={18} />
                                </button>
                              ) : j.state === "failed" ? (
                                <div className="generation-error">
                                  <b>这次海报没有完成</b>
                                  <p>{j.error}</p>
                                  {j.can_rerender && (
                                    <button
                                      className="text-action"
                                      disabled={busy}
                                      onClick={() => retryRender(j)}
                                    >
                                      重新检查并渲染（不调用模型）
                                    </button>
                                  )}
                                  <span>
                                    {completed.length
                                      ? "原来的作品已保留。"
                                      : "没有生成可用图片。"}
                                    可以继续发消息调整后再生成。
                                  </span>
                                </div>
                              ) : (
                                <div
                                  className="generation-progress"
                                  role="status"
                                >
                                  <LoaderCircle size={17} className="spin" />
                                  {phase[j.state]}
                                  <span className="progress-dots">…</span>
                                </div>
                              ))}
                          </div>
                        </article>
                      );
                    })}
                    {sending && (
                      <article className="message assistant">
                        <span className="assistant-mark">
                          <Sparkles size={18} />
                        </span>
                        <p className="thinking" role="status">
                          正在思考<span>···</span>
                        </p>
                      </article>
                    )}
                    <div ref={end} />
                  </div>
                </div>
                {composer}
              </>
            )}
          </main>
          {split && (
            <section
              className={
                "canvas-panel " + (mobileTab === "chat" ? "mobile-hidden" : "")
              }
              aria-label="海报画布"
            >
              <header className="canvas-header">
                <div>
                  <span className="canvas-label">CANVAS</span>
                  <h2>{artwork ? titleFrom(artwork.brief) : "创作中的海报"}</h2>
                </div>
                <div>
                  {artwork && (
                    <a
                      className="download-button"
                      href={artwork.image_url}
                      download
                    >
                      <Download size={16} />
                      <span>下载图片</span>
                    </a>
                  )}
                </div>
              </header>
              <div className="canvas-stage">
                {artwork ? (
                  <button
                    className="poster-preview"
                    aria-label="放大查看海报"
                    onClick={() => setModal("preview")}
                  >
                    <img
                      src={artwork.image_url}
                      alt={artwork.summary || "AI 生成的海报"}
                    />
                    <span>
                      <Maximize2 size={14} />
                      放大查看
                    </span>
                  </button>
                ) : (
                  <div className="canvas-placeholder">
                    <div className="blank-poster">
                      <Sparkles size={34} />
                      <i />
                      <i />
                      <i />
                    </div>
                    <h3>想法正在成形</h3>
                    <p>完成后，海报会出现在这里。</p>
                  </div>
                )}
                {active && (
                  <div className="generation-stages">
                    {["准备", "设计", "校验", "渲染"].map((label, i) => (
                      <span
                        key={label}
                        className={
                          i <=
                          [
                            "queued",
                            "designing",
                            "checking",
                            "rendering",
                          ].indexOf(active.state)
                            ? "done"
                            : ""
                        }
                      >
                        <i />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {active && (
                  <div className="canvas-working" role="status">
                    <LoaderCircle className="spin" size={16} />
                    {artwork
                      ? "正在设计新版本，原作已保留"
                      : phase[active.state]}
                  </div>
                )}
              </div>
              <footer className="canvas-footer">
                <div>
                  {completed.length > 0 && (
                    <label>
                      <span>版本</span>
                      <select
                        aria-label="画布版本"
                        value={artwork?.id}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        {completed.map((j, i) => (
                          <option key={j.id} value={j.id}>
                            版本 {i + 1}
                            {i === completed.length - 1 ? " · 最新" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {artwork && (
                    <button onClick={details}>
                      作品详情
                      <ChevronDown size={14} />
                    </button>
                  )}
                </div>
                {artwork && (
                  <div className="canvas-actions">
                    <button
                      className="evaluate-button"
                      onClick={() => {
                        setReviewTarget(artwork);
                        setModal("evaluate");
                      }}
                    >
                      <ScanLine size={16} />
                      {reviewScores[artwork.id + ":" + reviewModel] != null
                        ? `查看评测 · ${reviewScores[artwork.id + ":" + reviewModel]}分`
                        : "AI 评测海报"}
                    </button>
                    <button
                      className="refine-button"
                      disabled={busy || !!pending}
                      onClick={() => showTools("refine")}
                    >
                      <WandSparkles size={15} />
                      优化这一版
                    </button>
                    {completed.length > 1 && (
                      <button onClick={() => setModal("compare")}>
                        <GitCompareArrows size={15} />
                        版本对比
                      </button>
                    )}
                  </div>
                )}
                <p>每个版本独立保存，评测针对当前选中的海报。</p>
                <button
                  className="mobile-back"
                  onClick={() => setMobileTab("chat")}
                >
                  <ArrowLeft size={16} />
                  返回对话，继续修改
                </button>
              </footer>
            </section>
          )}
        </div>
        {storageError && (
          <div className="storage-warning" role="alert">
            {storageError}
          </div>
        )}
      </div>
      {modal === "evaluate" && reviewTarget && (
        <Dialog
          wide
          title="海报评测 · Design Review"
          close={() => setModal(null)}
        >
          <EvaluationPanel
            key={reviewTarget.id + ":" + reviewModel}
            reviewModel={reviewModel}
            designModel={
              modelPreferences.design || modelCatalog?.defaults.design
            }
            job={reviewTarget}
            busy={busy || !!pending}
            onJob={ingestJob}
            onSaved={(r: Review) =>
              setReviewScores((old) =>
                old[r.generation_id + ":" + r.model] === r.report!.overall
                  ? old
                  : {
                      ...old,
                      [r.generation_id + ":" + r.model]: r.report!.overall,
                    },
              )
            }
          />
        </Dialog>
      )}
      {modal === "creative" && (
        <Dialog
          wide
          title={planning ? "AI 正在整理需求…" : "创作工具箱"}
          close={() => {
            if (!planning) setModal(null);
          }}
        >
          <CreativeTools
            scope={(threadId || "new") + ":" + (artwork?.id || "none")}
            initialScene={initialScene}
            generate={(text, preset) => send(false, text, preset || style)}
            tab={toolTab}
            setTab={setToolTab}
            draft={draft}
            apply={applyPrompt}
            assets={assets}
            selected={assetIds}
            select={setAssetIds}
            brand={brand}
            saveBrand={(b) => {
              setBrand(b);
              save("posterlab.creative.brand", b);
            }}
            favorites={favorites}
            saveFavorites={(f) => {
              setFavorites(f);
              save("posterlab.creative.favorites", f);
            }}
            hasArtwork={!!artwork}
            busy={sending || anyActive || !!pending}
            canPlan={!!service?.ai}
            onWorking={setPlanning}
            done={() => {
              setModal(null);
              setMobileTab("chat");
            }}
            backup={backup}
            restore={restore}
            plan={async (text, key) => {
              const r = await api<{ reply: string }>(
                "/chat",
                {
                  mode: "plan",
                  model: modelPreferences.chat || modelCatalog?.defaults.chat,
                  design_model:
                    modelPreferences.design || modelCatalog?.defaults.design,
                  messages: [
                    { role: "user", content: text + brandContext(brand) },
                  ],
                  style,
                  format,
                  asset_ids: assetIds,
                },
                key,
              );
              return r.reply;
            }}
          />
        </Dialog>
      )}
      {modal === "compare" && (
        <Dialog wide title="版本对比" close={() => setModal(null)}>
          <VersionCompare jobs={completed} />
        </Dialog>
      )}
      {modal === "options" && (
        <Dialog title="创作偏好" close={() => setModal(null)}>
          <p className="dialog-copy">
            不用设置也能开始。你也可以直接在消息里描述风格和尺寸。
          </p>
          <label className="option-label">
            视觉方向
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="auto">让 AI 根据内容决定</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="option-label">
            画布尺寸
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="portrait">竖版海报 · 1080 × 1440</option>
              <option value="square">社交方图 · 1080 × 1080</option>
              <option value="landscape">横版封面 · 1920 × 1080</option>
            </select>
          </label>
          <ModelPicker
            catalog={modelCatalog}
            value={modelPreferences}
            onChange={(value) => {
              setModelPreferences(value);
              save("posterlab.models", value);
            }}
          />
          <button className="text-action" onClick={() => showTools("brand")}>
            设置品牌偏好与目标受众 →
          </button>
          <button className="dialog-done" onClick={() => setModal(null)}>
            <Check size={16} />
            完成
          </button>
        </Dialog>
      )}
      {modal === "details" && artwork && (
        <Dialog title="作品详情" close={() => setModal(null)}>
          <p className="dialog-copy">{artwork.summary}</p>
          <dl>
            <dt>风格</dt>
            <dd>{artwork.style_name}</dd>
            <dt>尺寸</dt>
            <dd>
              {artwork.report?.width} × {artwork.report?.height}
            </dd>
            <dt>模型</dt>
            <dd>{artwork.model}</dd>
            <dt>生成费用估算</dt>
            <dd>
              {artwork.cost != null
                ? "¥" + artwork.cost.toFixed(5)
                : "待核算，以平台账单为准"}
            </dd>
          </dl>
          {artwork.design_plan && (
            <details open>
              <summary>设计思路与实际变化</summary>
              <p>{artwork.design_plan}</p>
              <ul>
                {artwork.changes?.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
              {artwork.visual_delta && (
                <p>
                  画面像素变化 {artwork.visual_delta.changed_pixel_percent}
                  %（仅反映画面变化，不是质量提升分数）
                </p>
              )}
              <p>
                {artwork.reference_image_used
                  ? "本次设计参考了原海报图片和排版信息。"
                  : "本次为原创设计或文字参考设计。"}
              </p>
            </details>
          )}
          <details>
            <summary>查看本次生成 / 修改要求</summary>
            <p className="prompt-verbatim">
              {artwork.instruction || artwork.brief}
            </p>
          </details>
          {artwork.usage && (
            <p>
              实际用量：输入 {artwork.usage.prompt_tokens ?? "—"} / 输出{" "}
              {artwork.usage.completion_tokens ?? "—"} tokens
            </p>
          )}
          <details>
            <summary>查看风格提示词</summary>
            <p>{artwork.preset_prompt}</p>
          </details>
          <details>
            <summary>查看生成的 HTML</summary>
            <pre>{source || "正在读取…"}</pre>
          </details>
          <a
            className="source-download"
            href={
              STATIC_DEMO
                ? `${import.meta.env.BASE_URL}demo/${artwork.id}.zip`
                : "/api/generations/" + artwork.id + "/package"
            }
            download
          >
            下载 HTML 源文件包
            <Download size={15} />
          </a>
        </Dialog>
      )}
      {modal === "preview" && artwork && (
        <Dialog title="海报预览" close={() => setModal(null)}>
          <img
            className="full-poster"
            src={artwork.image_url}
            alt="完整海报预览"
          />
        </Dialog>
      )}
      {modal === "service" && (
        <Dialog title="服务与工具" close={() => setModal(null)}>
          <p className="dialog-copy">
            {service?.ai
              ? "AI 已连接 · 设计 " +
                (service.design_model || service.model) +
                " / 评测 " +
                (service.vision_model || "视觉模型")
              : STATIC_DEMO
                ? DEMO_MESSAGE
                : "AI 未连接。请配置服务端 STEP_API_KEY 后重启服务。"}
          </p>
          {service && !STATIC_DEMO && (
            <p>
              累计费用估算 ¥{service.spent.toFixed(4)} / ¥{service.budget}，预留
              ¥{service.reserved.toFixed(2)}。
            </p>
          )}
          <p className="dialog-copy">
            {STATIC_DEMO
              ? "本页只读取公开彩排案例。不会调用模型或上传你输入的内容。"
              : "对话保存在当前浏览器，生成海报保存在这台电脑。发布前请检查内容。"}
          </p>
          <button
            className="dialog-done"
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            重新检查连接
          </button>
          <a
            className="source-download"
            href={`${import.meta.env.BASE_URL}?mode=templates`}
          >
            模板与旧版工具
            <ArrowUpRight size={16} />
          </a>
        </Dialog>
      )}
    </div>
  );
}
