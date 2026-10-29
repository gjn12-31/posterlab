import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  Plus,
  LayoutGrid,
  FolderOpen,
  Palette,
  Settings2,
  ImagePlus,
  Type,
  LockKeyhole,
  LockKeyholeOpen,
  Download,
  Undo2,
  Redo2,
  Check,
  CheckCheck,
  ChevronDown,
  History,
  Upload,
  Copy,
  Search,
  X,
  Send,
  Image as ImageIcon,
  ScanText,
  Layers,
  PanelLeftClose,
  Maximize2,
  Pause,
  Play,
  Sun,
  ChevronRight,
  FileJson,
  Link,
  LoaderCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Trash2,
} from "lucide-react";
import {
  createProject,
  checkpoint,
  fields,
  labels,
  themes,
  formats,
  parseBrief,
  localSuggestion,
  applySuggestion,
  parseProject,
  parseCsv,
  now,
  type Project,
  type Field,
  type Format,
  type Theme,
  type Snapshot,
  type Suggestion,
  type Brief,
  type Brand,
} from "./model";
import { saveProject, listProjects, setting, migrate } from "./storage";
import {
  renderPoster,
  loadFonts,
  exportBlob,
  exportPack,
  download,
  readAsset,
} from "./render";
import { status, aiSuggestion, request, type Service } from "./api";
import "./style.css";
const clone = <T,>(x: T): T => structuredClone(x);
function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon" aria-label="关闭弹窗" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [page, setPage] = useState<"home" | "studio" | "gallery" | "brand">(
      "home",
    ),
    [project, setProject] = useState<Project>(createProject),
    [projects, setProjects] = useState<Project[]>([]),
    [tab, setTab] = useState<"content" | "styles" | "assets">("content"),
    [format, setFormat] = useState<Format>("portrait"),
    [ready, setReady] = useState(false),
    [fontError, setFontError] = useState(false),
    [saved, setSaved] = useState("准备工作空间"),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<
      "brief" | "history" | "export" | "settings" | "import" | "explore" | null
    >(null),
    [briefText, setBriefText] = useState(
      "标题：设计的无限可能\n主讲人：林溪\n日期：2026-11-08\n时间：14:00–16:00\n地点：创意空间 · 一层展厅\n介绍：一场关于设计、技术与想象力的开放分享。",
    ),
    [command, setCommand] = useState(""),
    [suggestion, setSuggestion] = useState<Suggestion | null>(null),
    [busy, setBusy] = useState(""),
    [service, setService] = useState<Service | null>(null),
    [rightTab, setRightTab] = useState<"assistant" | "checks">("assistant"),
    [undo, setUndo] = useState<Snapshot[]>([]),
    [redo, setRedo] = useState<Snapshot[]>([]),
    [motionLevel, setMotionLevel] = useState(2),
    [samples, setSamples] = useState<
      { id: string; name: string; fields: Partial<Brief>; source_url: string }[]
    >([]),
    [query, setQuery] = useState(""),
    [brand, setBrand] = useState<Brand>({
      name: "MY CREATIVE STUDIO",
      accent: "#64509a",
      enabled: true,
    }),
    [initialized, setInitialized] = useState(false),
    [storageError, setStorageError] = useState(false),
    [selectedField, setSelectedField] = useState<Field>("title"),
    [exportKind, setExportKind] = useState<"png" | "svg" | "pack">("png");
  const reduced = useReducedMotion(),
    currentRef = useRef(project),
    saveQueue = useRef(Promise.resolve()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  currentRef.current = project;
  const message = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  const persist = useCallback(async (p: Project) => {
    const operation = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(p));
    saveQueue.current = operation;
    await operation;
  }, []);
  useEffect(() => {
    loadFonts()
      .then(() => setReady(true))
      .catch(() => {
        setFontError(true);
        message("海报字体加载失败，请刷新重试，导出已暂停");
      });
    fetch(import.meta.env.BASE_URL + "samples.json")
      .then((r) => r.json())
      .then(setSamples)
      .catch(() => {});
    status()
      .then(setService)
      .catch(() => setService(null));
    (async () => {
      try {
        const count = await migrate();
        const rows = await listProjects();
        setProjects(rows);
        const latest = await setting("current");
        if (latest) {
          const p = rows.find((p) => p.id === latest);
          if (p) setProject(p);
        }
        const savedBrand = await setting("brand");
        if (savedBrand) setBrand(savedBrand);
        const level = await setting("motion");
        if (typeof level === "number") setMotionLevel(level);
        if (count) message(`已迁入 ${count} 个旧版作品，原始数据已保留`);
      } catch {
        setStorageError(true);
        message("浏览器存储不可用，请及时导出项目备份");
      } finally {
        setInitialized(true);
      }
    })();
  }, [message]);
  useEffect(() => {
    if (!initialized) return;
    setSaved("正在保存…");
    const p = clone(project);
    persist(p)
      .then(() =>
        currentRef.current.id === p.id ? setting("current", p.id) : undefined,
      )
      .then(() => {
        if (currentRef.current.updated === p.updated) {
          setSaved("已自动保存");
          setStorageError(false);
        }
      })
      .catch(() => {
        setSaved("保存失败，请导出备份");
        setStorageError(true);
      });
  }, [project, initialized, persist]);
  useEffect(() => {
    document.body.dataset.motion = String(reduced ? 0 : motionLevel);
  }, [motionLevel, reduced]);
  const rendered = useMemo(
    () => (ready ? renderPoster(project, format) : { svg: "", issues: [] }),
    [project, format, ready],
  );
  const allIssues = useMemo(
    () =>
      ready
        ? (Object.keys(formats) as Format[]).map((f) => ({
            format: f,
            ...renderPoster(project, f),
          }))
        : [],
    [project, ready],
  );
  function edit(fn: (s: Snapshot) => void) {
    setProject((p) => {
      setUndo((u) => [clone(p.current), ...u].slice(0, 40));
      setRedo([]);
      const next = clone(p);
      fn(next.current);
      next.updated = now();
      return next;
    });
  }
  function apply(next: Project, label: string) {
    setUndo((u) => [clone(project.current), ...u].slice(0, 40));
    setRedo([]);
    setProject({
      ...checkpoint(next, label),
      history: [clone(project.current), ...project.history].slice(0, 20),
    });
  }
  async function navigate(next: typeof page) {
    if (next === "gallery") {
      try {
        await persist(currentRef.current);
        setProjects(await listProjects());
      } catch {
        message("作品列表读取失败，当前画布仍可导出");
      }
    }
    setPage(next);
    window.scrollTo(0, 0);
  }
  function newProject() {
    const next = createProject();
    next.current.brand = clone(brand);
    next.current.brand.enabled = false;
    setProject(next);
    setUndo([]);
    setRedo([]);
    setPage("studio");
    setTab("content");
    window.scrollTo(0, 0);
  }
  function travel(dir: "undo" | "redo") {
    const from = dir === "undo" ? undo : redo;
    if (!from.length) return;
    const next = from[0];
    if (dir === "undo") {
      setUndo(from.slice(1));
      setRedo((r) => [clone(project.current), ...r]);
    } else {
      setRedo(from.slice(1));
      setUndo((r) => [clone(project.current), ...r]);
    }
    setProject((p) => ({ ...p, current: clone(next), updated: now() }));
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        persist(currentRef.current)
          .then(() => message("作品已保存"))
          .catch(() => message("保存失败，请导出备份"));
      }
      if (e.key === "Escape") setSuggestion(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [persist, message]);
  async function assistant() {
    if (!command.trim()) return;
    const requested = project;
    setBusy("正在准备修改建议");
    try {
      const result = service?.ai
        ? await aiSuggestion(
            project,
            `只修改当前选中的${labels[selectedField]}或明确指定的排版。${command}`,
          )
        : localSuggestion(command, project);
      if (
        currentRef.current.id !== requested.id ||
        currentRef.current.updated !== requested.updated
      )
        throw Error("作品已更改，请基于最新内容重新请求建议");
      setSuggestion(result);
      setCommand("");
    } catch (e) {
      message((e as Error).message);
    } finally {
      setBusy("");
      status()
        .then(setService)
        .catch(() => {});
    }
  }
  async function extract(useAI: boolean) {
    if (!briefText.trim()) return;
    const requested = project;
    setBusy("正在提取活动信息");
    try {
      const s: Suggestion = useAI
        ? await aiSuggestion(project, briefText, "extract")
        : {
            fields: parseBrief(briefText),
            source: "local",
            reason:
              "从标注字段与完整日期中提取，请核对后导入。当前活动信息将按下方选择替换。",
          };
      if (!Object.keys(s.fields).length)
        throw Error("未识别到字段，请使用“标题：…”等格式，或启用 AI 提取");
      if (
        currentRef.current.id !== requested.id ||
        currentRef.current.updated !== requested.updated
      )
        throw Error("作品已更改，请重新提取通知");
      setSuggestion(s);
      setModal(null);
    } catch (e) {
      message((e as Error).message);
    } finally {
      setBusy("");
      status()
        .then(setService)
        .catch(() => {});
    }
  }
  async function upload(file: File, role: "heroId" | "logoId") {
    setBusy("正在处理图片");
    try {
      const asset = await readAsset(file);
      if (Object.keys(project.assets).length >= 20)
        throw Error("每个项目最多20项素材，请另建项目");
      const next = clone(project);
      next.assets[asset.id] = asset;
      next.current[role] = asset.id;
      apply(next, "添加" + (role === "heroId" ? "主题图片" : "品牌标识"));
      message("图片已加入，原图比例保留，主题区采用居中裁切");
    } catch (e) {
      message((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function runExport() {
    if (!ready || fontError) return;
    setBusy("正在准备导出");
    try {
      const frozen = clone(project),
        name =
          frozen.current.brief.title
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
            .slice(0, 40) || "我的海报";
      if (exportKind === "pack") {
        const blob = await exportPack(frozen, (n) =>
          setBusy(`正在打包 ${n}/3 张海报`),
        );
        download(blob, `${name}-活动物料包.zip`);
      } else {
        download(
          await exportBlob(frozen, format, exportKind),
          `${name}-${formats[format].ratio.replace(":", "x")}.${exportKind}`,
        );
      }
      setProject((p) => ({ ...p, lastExport: frozen.updated }));
      message("导出完成，发布前请核对活动信息");
      setModal(null);
    } catch (e) {
      message((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function backup() {
    download(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      "posterlab-project.json",
    );
    message("项目备份已导出，可在新设备导入");
  }
  async function importFile(file: File) {
    try {
      if (file.size > 25_000_000) throw Error("项目文件上限25MB");
      if (file.name.endsWith(".csv")) {
        const rows = parseCsv(await file.text());
        const keys: Record<string, Field> = {
          标题: "title",
          主讲人: "speaker",
          日期: "date",
          时间: "time",
          地点: "venue",
          简介: "description",
          链接: "url",
        };
        const imports = rows.map((row) => {
          const brief: Partial<Brief> = {
            speaker: "",
            date: "",
            time: "",
            venue: "",
            description: "",
            cta: "",
            url: "",
          };
          for (const [k, v] of Object.entries(row)) {
            const field = keys[k] || (k as Field);
            if (fields.includes(field)) brief[field] = v;
          }
          return parseProject(JSON.stringify(createProject(brief)));
        });
        for (const p of imports) await persist(p);
        setProjects(await listProjects());
        setPage("gallery");
        message(`已导入 ${imports.length} 个活动，请逐项核对信息`);
      } else {
        const p = parseProject(await file.text());
        p.id = crypto.randomUUID();
        p.updated = now();
        p.current.label = "导入的副本";
        await persist(p);
        setProject(p);
        setUndo([]);
        setRedo([]);
        setPage("studio");
        message("项目已导入为新副本");
      }
      setModal(null);
    } catch (e) {
      message(e instanceof Error ? e.message : "导入失败");
    }
  }
  const motionOn = !reduced && motionLevel > 0;
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brandmark" />
          <b>PosterLab</b>
          <sup>STUDIO</sup>
        </a>
        <nav aria-label="主导航">
          <a
            href={import.meta.env.BASE_URL}
            style={{ fontSize: 12, color: "#c6ffe1" }}
          >
            AI 创作
          </a>
          <button
            className={page === "studio" ? "active" : ""}
            onClick={() => navigate("studio")}
          >
            创作空间
          </button>
          <button
            className={page === "gallery" ? "active" : ""}
            onClick={() => navigate("gallery")}
          >
            我的作品
          </button>
          <button
            className={page === "brand" ? "active" : ""}
            onClick={() => navigate("brand")}
          >
            品牌空间
          </button>
        </nav>
        <div className="top-actions">
          <span className="service-badge">
            <i />
            {service?.ai ? "AI 已连接" : "本地创作"}
          </span>
          <button
            className="icon"
            aria-label={motionLevel ? "暂停动态效果" : "恢复动态效果"}
            onClick={() => {
              const n = motionLevel ? 0 : 2;
              setMotionLevel(n);
              setting("motion", n).catch(() => {});
            }}
          >
            {motionLevel ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="icon"
            aria-label="服务设置"
            onClick={() => setModal("settings")}
          >
            <Settings2 size={17} />
          </button>
          <button className="outline small" onClick={newProject}>
            新建作品 <Plus size={15} />
          </button>
        </div>
      </header>
      {page === "home" && (
        <main className="home">
          <section className="hero">
            <div className="aurora" />
            <div className="hero-copy">
              <div className="eyebrow-pill">
                <span /> YOUR IDEAS, IN FULL COLOR <i>01 / 光场</i>
              </div>
              <h1>
                让灵感，
                <br />
                在此<span>大放异彩。</span>
              </h1>
              <p>
                从一个想法，到一整套惊艳的视觉表达。
                <br />
                把创意、品牌与活动信息，放进同一个空间。
              </p>
              <div className="hero-cta">
                <button className="primary" onClick={newProject}>
                  开启我的创作 <ArrowRight size={19} />
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setPage("studio");
                    setModal("brief");
                  }}
                >
                  <ScanText size={18} />
                  从活动通知开始
                </button>
              </div>
              <div className="hero-proof">
                <span>文</span>
                <span>图</span>
                <span>形</span>
                <p>文字 · 图像 · 想象力，终于在一起。</p>
              </div>
            </div>
            <div className="hero-art">
              <div className="orbit" />
              <div className="hero-card green">
                <small>BOTANICAL NOTES / 2026</small>
                <h2>
                  NATURE
                  <br />
                  IN EVERY
                  <br />
                  FORM.
                </h2>
                <div className="hero-rings" />
                <footer>
                  自然的形状
                  <br />A NEW PERSPECTIVE
                </footer>
              </div>
              <div className="hero-card orange">
                <small>BREAK THE GRID</small>
                <h2>
                  MAKE
                  <br />
                  NOISE.
                </h2>
                <div className="star-shape" />
                <footer>创意，不必循规蹈矩。</footer>
              </div>
              <div className="hero-card purple">
                <small>DESIGN BEYOND LIMITS</small>
                <h2>
                  IDEAS
                  <br />
                  TAKE
                  <br />
                  SHAPE.
                </h2>
                <div className="chrome-object" />
                <footer>
                  让想象，有形。
                  <br />
                  POSTERLAB CREATIVE STUDIO
                </footer>
              </div>
              <div className="floating-label float-top">
                <Sparkles size={17} />
                一种灵感，无限种表达
              </div>
              <div className="floating-label float-bottom">
                <span />
                好设计，从这里发生
              </div>
            </div>
          </section>
          <section className="home-features">
            <div className="section-title">
              <div>
                <p className="eyebrow">A LITTLE MORE POSSIBILITY</p>
                <h2>漂亮之外，更有想象。</h2>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("studio")}
              >
                进入工作台 <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="feature-grid">
              {[
                {
                  icon: ScanText,
                  title: "一份通知，创作的起点。",
                  text: "粘贴活动信息，核对后直接带入海报。",
                  action: () => {
                    setPage("studio");
                    setModal("brief");
                  },
                },
                {
                  icon: Layers,
                  title: "每一种尺寸，都精彩。",
                  text: "同一份内容同步三种画幅，整套打包下载。",
                  action: () => navigate("studio"),
                },
                {
                  icon: Palette,
                  title: "好风格，有你的名字。",
                  text: "六套视觉方向，加上你的品牌色和标识。",
                  action: () => navigate("brand"),
                },
              ].map((item, i) => (
                <motion.button
                  className="feature-card"
                  key={item.title}
                  whileHover={motionOn ? { y: -6 } : undefined}
                  onClick={item.action}
                >
                  <div className={"feature-visual fv" + i}>
                    <item.icon size={38} />
                    <i />
                    <i />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                  <ArrowUpRight size={17} />
                </motion.button>
              ))}
            </div>
          </section>
          <footer className="home-footer">
            <span>POSTERLAB / MADE FOR YOUR NEXT BIG IDEA.</span>
            <span>本地优先 · 可编辑 · 可追溯</span>
          </footer>
        </main>
      )}
      {page === "studio" && (
        <main className="workspace">
          <div className="workspace-bar">
            <div>
              <button
                className="icon"
                aria-label="回到作品库"
                onClick={() => navigate("gallery")}
              >
                <FolderOpen size={18} />
              </button>
              <span className="project-name">
                {project.current.brief.title.replace(/\n/g, "") || "未命名作品"}
              </span>
              <span className={"save-state " + (storageError ? "error" : "")}>
                <i />
                {saved}
              </span>
            </div>
            <div>
              <button
                className="icon"
                aria-label="撤销"
                disabled={!undo.length}
                onClick={() => travel("undo")}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon"
                aria-label="重做"
                disabled={!redo.length}
                onClick={() => travel("redo")}
              >
                <Redo2 size={17} />
              </button>
              <span className="divider" />
              <button
                className="outline small"
                onClick={() => {
                  setProject(checkpoint(project, "手动版本"));
                  message("已保存版本快照");
                }}
              >
                <Plus size={14} />
                存为版本
              </button>
              <button
                className="icon"
                aria-label="版本历史"
                onClick={() => setModal("history")}
              >
                <History size={18} />
              </button>
              <button
                className="primary small"
                disabled={!ready}
                onClick={() => setModal("export")}
              >
                导出物料 <Download size={16} />
              </button>
            </div>
          </div>
          <div className="studio-layout">
            <aside className="editor-panel">
              <div className="panel-tabs" role="group" aria-label="编辑面板">
                {(["content", "styles", "assets"] as const).map((t, i) => (
                  <button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {
                      [
                        <Type size={16} />,
                        <Palette size={16} />,
                        <ImageIcon size={16} />,
                      ][i]
                    }
                    {["内容", "风格", "素材"][i]}
                  </button>
                ))}
              </div>
              {tab === "content" && (
                <div className="panel-content">
                  <button
                    className="brief-launch"
                    onClick={() => setModal("brief")}
                  >
                    <ScanText size={17} />
                    <div>
                      从通知提取活动信息<small>粘贴文字，快速开始</small>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                  <label className="label">
                    公开示例
                    <select
                      value=""
                      onChange={(e) => {
                        const sample = samples.find(
                          (s) => s.id === e.target.value,
                        );
                        if (sample) {
                          const next = clone(project);
                          next.current.brief = {
                            ...next.current.brief,
                            ...sample.fields,
                          };
                          apply(next, "载入历史活动示例");
                          message("历史活动资料，仅用于试作，请勿作为最新预告");
                        }
                      }}
                    >
                      <option value="">从示例获得灵感</option>
                      {samples.map((s) => (
                        <option value={s.id} key={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="field-list">
                    {fields.map((field) => (
                      <label
                        className={
                          "label field " +
                          (selectedField === field ? "selected-field" : "")
                        }
                        key={field}
                      >
                        <span>
                          {labels[field]}
                          <button
                            className="lock-button"
                            type="button"
                            aria-label={
                              (project.current.locked.includes(field)
                                ? "解锁"
                                : "锁定") + labels[field]
                            }
                            title="锁定后 AI 不得修改，仍可手动编辑"
                            onClick={() =>
                              edit(
                                (s) =>
                                  (s.locked = s.locked.includes(field)
                                    ? s.locked.filter((k) => k !== field)
                                    : [...s.locked, field]),
                              )
                            }
                          >
                            {project.current.locked.includes(field) ? (
                              <LockKeyhole size={12} />
                            ) : (
                              <LockKeyholeOpen size={12} />
                            )}
                          </button>
                        </span>
                        {field === "title" || field === "description" ? (
                          <textarea
                            id={"field-" + field}
                            aria-label={labels[field]}
                            rows={field === "title" ? 2 : 3}
                            value={project.current.brief[field]}
                            maxLength={field === "title" ? 180 : 1200}
                            onFocus={() => setSelectedField(field)}
                            onChange={(e) =>
                              edit((s) => {
                                s.brief[field] = e.target.value;
                              })
                            }
                          />
                        ) : (
                          <input
                            id={"field-" + field}
                            aria-label={labels[field]}
                            type={
                              field === "date"
                                ? "date"
                                : field === "url"
                                  ? "url"
                                  : "text"
                            }
                            maxLength={
                              field === "url"
                                ? 1000
                                : field === "venue"
                                  ? 220
                                  : 120
                            }
                            value={project.current.brief[field]}
                            onFocus={() => setSelectedField(field)}
                            onChange={(e) =>
                              edit((s) => {
                                s.brief[field] = e.target.value;
                              })
                            }
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <p className="fineprint">
                    <LockKeyhole size={12} />
                    锁定保护 AI 修改。手动输入视为你的明确更改。
                  </p>
                </div>
              )}
              {tab === "styles" && (
                <div className="panel-content">
                  <p className="panel-caption">选择一种视觉语言</p>
                  <button
                    className="brief-launch"
                    onClick={() => setModal("explore")}
                  >
                    <Sparkles size={17} />
                    <div>
                      灵感实验室<small>同一份内容，六种完整设计对比</small>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="theme-grid">
                    {(Object.keys(themes) as Theme[]).map((t) => (
                      <button
                        key={t}
                        className={
                          "theme-card " +
                          (project.current.theme === t ? "selected" : "")
                        }
                        aria-pressed={project.current.theme === t}
                        onClick={() => edit((s) => (s.theme = t))}
                      >
                        <div
                          className={"theme-art " + t}
                          style={{
                            background: themes[t].bg,
                            color: themes[t].ink,
                          }}
                        >
                          <span>Aa</span>
                          <i style={{ background: themes[t].accent }} />
                          {project.current.theme === t && <Check size={14} />}
                        </div>
                        <b>{themes[t].name}</b>
                        <small>{themes[t].tag}</small>
                      </button>
                    ))}
                  </div>
                  <div className="form-section">
                    <label className="label">
                      标题比例{" "}
                      <span>
                        {Math.round(project.current.titleScale * 100)}%
                      </span>
                      <input
                        aria-label="标题比例"
                        type="range"
                        min=".65"
                        max="1.4"
                        step=".05"
                        value={project.current.titleScale}
                        onChange={(e) =>
                          edit((s) => (s.titleScale = Number(e.target.value)))
                        }
                      />
                    </label>
                    <label className="label">
                      标题对齐
                      <select
                        value={project.current.align}
                        onChange={(e) =>
                          edit(
                            (s) =>
                              (s.align = e.target.value as "left" | "center"),
                          )
                        }
                      >
                        <option value="left">左对齐</option>
                        <option value="center">居中</option>
                      </select>
                    </label>
                    <button
                      className="outline full"
                      onClick={() => {
                        edit((s) => (s.brand = clone(brand)));
                        message("已应用品牌设置");
                      }}
                    >
                      <Palette size={15} />
                      应用我的品牌
                    </button>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={project.current.brand.enabled}
                        onChange={(e) =>
                          edit((s) => (s.brand.enabled = e.target.checked))
                        }
                      />
                      使用品牌强调色
                    </label>
                  </div>
                </div>
              )}
              {tab === "assets" && (
                <div className="panel-content">
                  <p className="panel-caption">让作品拥有你的视角</p>
                  {(["heroId", "logoId"] as const).map((role) => (
                    <div className="asset-section" key={role}>
                      <h3>{role === "heroId" ? "主题配图" : "品牌标识"}</h3>
                      {project.current[role] &&
                        project.assets[project.current[role]!] && (
                          <div className="asset-preview">
                            <img
                              src={project.assets[project.current[role]!].data}
                              alt={role === "heroId" ? "主题配图" : "品牌标识"}
                            />
                            <button
                              className="icon"
                              aria-label={
                                "移除" +
                                (role === "heroId" ? "主题配图" : "品牌标识")
                              }
                              onClick={() =>
                                edit((s) => {
                                  delete s[role];
                                })
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      <label className="upload-drop">
                        <ImagePlus size={24} />
                        <span>
                          上传{role === "heroId" ? "主题图片" : "Logo"}
                          <small>PNG / JPEG / WebP · 最大8MB</small>
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          aria-label={
                            role === "heroId" ? "上传主题图片" : "上传品牌标识"
                          }
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) upload(f, role);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                  ))}
                  <p className="fineprint">
                    图片保存在你的浏览器与项目备份中。请确认拥有使用权；导出前检查裁切。
                  </p>
                  <button
                    className="outline full"
                    onClick={() => setTab("content")}
                  >
                    <Link size={15} />
                    添加报名链接与二维码
                  </button>
                </div>
              )}
            </aside>
            <section className="canvas-panel" aria-label="海报画布">
              <div className="canvas-heading">
                <div>
                  <span className="live-dot" />
                  实时预览{" "}
                  <small>
                    {formats[format].width} × {formats[format].height}
                  </small>
                </div>
                <span className="dimension-name">{formats[format].name}</span>
              </div>
              <div className="artboard-area">
                <div className="canvas-glow" />
                {ready ? (
                  <motion.div
                    className="artboard"
                    key={format}
                    initial={motionOn ? { opacity: 0.3, scale: 0.96 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35 }}
                    style={{
                      aspectRatio: `${formats[format].width}/${formats[format].height}`,
                      maxWidth:
                        format === "landscape"
                          ? "90%"
                          : format === "square"
                            ? "450px"
                            : "380px",
                    }}
                    dangerouslySetInnerHTML={{ __html: rendered.svg }}
                  />
                ) : (
                  <div className="loading">
                    <LoaderCircle className="spin" />
                    {fontError
                      ? "字体加载失败，请刷新"
                      : "正在加载中文排版字体…"}
                  </div>
                )}
              </div>
              <div className="canvas-dock" role="group" aria-label="画幅">
                {(Object.keys(formats) as Format[]).map((f) => (
                  <button
                    key={f}
                    aria-pressed={format === f}
                    onClick={() => setFormat(f)}
                  >
                    <span className={"format-icon " + f} />
                    {formats[f].ratio}
                  </button>
                ))}
              </div>
              <div className="canvas-bottom">
                <span>
                  <Layers size={13} />
                  三种尺寸共享活动信息
                </span>
                <span>
                  {project.lastExport && project.lastExport !== project.updated
                    ? "内容已更新，建议重新导出"
                    : "中文文字与图片分层排版"}
                </span>
              </div>
            </section>
            <aside className="assistant-panel">
              <div className="panel-tabs" role="group" aria-label="助手面板">
                <button
                  aria-pressed={rightTab === "assistant"}
                  onClick={() => setRightTab("assistant")}
                >
                  <Sparkles size={15} />
                  创作助手
                </button>
                <button
                  aria-pressed={rightTab === "checks"}
                  onClick={() => setRightTab("checks")}
                >
                  <CheckCheck size={15} />
                  检查{" "}
                  {rendered.issues.length > 0 && (
                    <em>{rendered.issues.length}</em>
                  )}
                </button>
              </div>
              {rightTab === "assistant" ? (
                <div className="assistant-content">
                  <div className="assistant-identity">
                    <span>
                      <Sparkles size={22} />
                    </span>
                    <h3>让想法，再往前一步。</h3>
                    <p>选中一个字段，告诉我你想怎么调整。</p>
                  </div>
                  <div className="selection-card">
                    <span>当前修改对象</span>
                    <select
                      aria-label="修改对象"
                      value={selectedField}
                      onChange={(e) =>
                        setSelectedField(e.target.value as Field)
                      }
                    >
                      {fields.map((f) => (
                        <option key={f} value={f}>
                          {labels[f]}
                        </option>
                      ))}
                    </select>
                    <small>
                      {project.current.locked.includes(selectedField)
                        ? "该字段已锁定，AI 不会改动。"
                        : "修改前会展示预览，应用后可撤销。"}
                    </small>
                  </div>
                  <div className="suggestion-chips">
                    {["标题更醒目", "试试自然绿色", "切换午夜深色"].map(
                      (text) => (
                        <button key={text} onClick={() => setCommand(text)}>
                          <Sparkles size={12} />
                          {text}
                          <Plus size={12} />
                        </button>
                      ),
                    )}
                  </div>
                  <div className="assistant-composer">
                    <textarea
                      aria-label="创作指令"
                      value={command}
                      maxLength={2000}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder={
                        service?.ai
                          ? "描述你想修改的地方…"
                          : "试试“标题更醒目”或“自然绿色”…"
                      }
                    />
                    <div>
                      <span>{service?.ai ? "StepFun AI" : "本地排版指令"}</span>
                      <button
                        aria-label="发送创作指令"
                        disabled={!command.trim() || !!busy}
                        onClick={assistant}
                      >
                        {busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <ArrowRight size={17} />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="assistant-note">
                    <LockKeyhole size={14} />
                    <p>
                      日期、地点等关键内容保持锁定。未连接 AI
                      时，使用明确的本地排版指令。
                    </p>
                  </div>
                  <div className="mini-check">
                    <CheckCircle2 size={17} />
                    <div>
                      发布前，再检查一次
                      <small>检查文字长度、关键字段和二维码区域。</small>
                    </div>
                    <button
                      aria-label="查看检查结果"
                      onClick={() => setRightTab("checks")}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="panel-content">
                  <div className="check-overview">
                    <span
                      className={
                        rendered.issues.some((i) => i.level === "error")
                          ? "error"
                          : ""
                      }
                    >
                      {rendered.issues.some((i) => i.level === "error") ? (
                        <AlertTriangle size={28} />
                      ) : (
                        <CheckCircle2 size={28} />
                      )}
                    </span>
                    <h3>
                      {rendered.issues.some((i) => i.level === "error")
                        ? "先解决这些问题"
                        : "当前画幅可以导出"}
                    </h3>
                    <p>规则检查不核实活动真实性。</p>
                  </div>
                  {rendered.issues.map((i, n) => (
                    <button
                      className={"issue " + i.level}
                      key={n}
                      onClick={() => {
                        if (i.field) {
                          setTab("content");
                          setSelectedField(i.field);
                          setTimeout(
                            () =>
                              document
                                .getElementById("field-" + i.field)
                                ?.focus(),
                            30,
                          );
                        }
                      }}
                    >
                      <AlertTriangle size={15} />
                      <span>{i.message}</span>
                      {i.field && <ChevronRight size={13} />}
                    </button>
                  ))}
                  {!rendered.issues.length && (
                    <div className="check-good">
                      <Check size={14} />
                      信息齐全，文字位于安全区域
                    </div>
                  )}
                  <h4 className="panel-caption">整套物料状态</h4>
                  {allIssues.map((r) => (
                    <button
                      className="format-check"
                      key={r.format}
                      onClick={() => setFormat(r.format)}
                    >
                      <span>{formats[r.format].name}</span>
                      <span>
                        {r.issues.some((i) => i.level === "error") ? (
                          <AlertTriangle size={15} />
                        ) : (
                          <Check size={15} />
                        )}
                      </span>
                    </button>
                  ))}
                  <p className="fineprint">
                    报名链接会生成真实二维码；发布前请使用手机扫描确认目标。图片裁切和事实内容仍需人工核对。
                  </p>
                </div>
              )}
            </aside>
          </div>
        </main>
      )}
      {page === "gallery" && (
        <main className="library">
          <div className="section-title">
            <div>
              <p className="eyebrow">YOUR CREATIVE COLLECTION</p>
              <h1>每个好想法，都有归处。</h1>
              <p>保存在当前浏览器。导出项目备份，可以带到另一台设备。</p>
            </div>
            <div className="button-row">
              <button className="outline" onClick={() => setModal("import")}>
                <Upload size={16} />
                导入项目 / CSV
              </button>
              <button className="primary" onClick={newProject}>
                <Plus size={16} />
                新建作品
              </button>
            </div>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="搜索作品"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索活动标题或地点…"
            />
          </label>
          <div className="gallery-grid">
            {projects
              .filter((p) =>
                (p.current.brief.title + p.current.brief.venue).includes(query),
              )
              .map((p) => (
                <article className="work-card" key={p.id}>
                  <button
                    className="work-preview"
                    aria-label={"打开作品 " + p.current.brief.title}
                    onClick={() => {
                      setProject(p);
                      setUndo([]);
                      setRedo([]);
                      setPage("studio");
                    }}
                  >
                    {ready && (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: renderPoster(p, "portrait").svg,
                        }}
                      />
                    )}
                  </button>
                  <div className="work-meta">
                    <div>
                      <h3>{p.current.brief.title}</h3>
                      <p>
                        {themes[p.current.theme].name} ·{" "}
                        {new Date(p.updated).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <button
                      className="icon"
                      aria-label={"复制作品 " + p.current.brief.title}
                      onClick={async () => {
                        const next = clone(p);
                        next.id = crypto.randomUUID();
                        next.current.brief.title =
                          next.current.brief.title.slice(0, 176) + " 副本";
                        next.updated = now();
                        try {
                          await persist(next);
                          setProjects(await listProjects());
                          message("已创建独立副本");
                        } catch {
                          message("副本保存失败，请检查浏览器存储或导出备份");
                        }
                      }}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!projects.length && (
            <div className="empty">
              <FolderOpen size={42} />
              <h2>你的作品集，从这里开始。</h2>
              <button className="primary" onClick={newProject}>
                制作第一张海报 <ArrowRight size={16} />
              </button>
            </div>
          )}
        </main>
      )}
      {page === "brand" && (
        <main className="brand-page">
          <div className="section-title">
            <div>
              <p className="eyebrow">MAKE IT UNMISTAKABLY YOURS</p>
              <h1>好风格，有你的名字。</h1>
              <p>让每一场活动，延续同一种视觉语言。</p>
            </div>
          </div>
          <div className="brand-layout">
            <div className="brand-form">
              <label className="label">
                品牌名称
                <input
                  aria-label="品牌名称"
                  maxLength={80}
                  value={brand.name}
                  onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                />
              </label>
              <label className="label">
                品牌强调色
                <div className="color-input">
                  <input
                    aria-label="品牌强调色"
                    type="color"
                    value={brand.accent}
                    onChange={(e) =>
                      setBrand({ ...brand, accent: e.target.value })
                    }
                  />
                  <span>{brand.accent.toUpperCase()}</span>
                </div>
              </label>
              <p className="fineprint">
                品牌色用于标签、线条与装饰，正文保持模板对比度。Logo
                在作品的素材面板中添加。
              </p>
              <button
                className="primary full"
                onClick={async () => {
                  try {
                    await setting("brand", brand);
                    edit((s) => (s.brand = { ...brand, enabled: true }));
                    message("品牌已保存并应用到当前作品");
                  } catch {
                    message("品牌保存失败，请检查浏览器存储");
                  }
                }}
              >
                保存并应用 <Check size={16} />
              </button>
            </div>
            <div
              className="brand-showcase"
              style={{ "--brand-accent": brand.accent } as React.CSSProperties}
            >
              <div className="brand-orb" />
              <span>{brand.name}</span>
              <h2>
                DESIGNED
                <br />
                TO BE
                <br />
                REMEMBERED.
              </h2>
              <small>一种风格，贯穿每一次表达。</small>
            </div>
          </div>
        </main>
      )}
      {modal === "brief" && (
        <Modal title="把活动通知，变成创作起点。" close={() => setModal(null)}>
          <p className="muted">
            粘贴文字，先提取信息，再核对并导入。带标签的通知可在本地解析。
          </p>
          <textarea
            className="brief-input"
            aria-label="活动通知"
            rows={10}
            maxLength={12000}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
          />
          <div className="button-row">
            <button
              className="outline"
              disabled={!!busy}
              onClick={() => extract(false)}
            >
              <ScanText size={16} />
              本地提取
            </button>
            <button
              className="primary"
              disabled={!service?.ai || !!busy}
              onClick={() => extract(true)}
            >
              <Sparkles size={16} />
              AI 理解通知
            </button>
          </div>
          {!service?.ai && (
            <p className="fineprint">
              AI 功能需启动服务端并设置 STEP_API_KEY；本地提取不调用模型。
            </p>
          )}
        </Modal>
      )}
      {suggestion && (
        <SuggestionModal
          project={project}
          suggestion={suggestion}
          close={() => setSuggestion(null)}
          confirm={(s, unlock) => {
            try {
              const next = clone(project);
              if (unlock)
                next.current.locked = next.current.locked.filter(
                  (k) => !(k in s.fields),
                );
              const applied = applySuggestion(next, s);
              applied.current.locked = clone(project.current.locked);
              apply(
                applied,
                "应用" + (s.source === "local" ? "本地" : "AI") + "建议",
              );
              setSuggestion(null);
              message("修改已应用到全部画幅，可撤销");
            } catch (e) {
              message((e as Error).message);
            }
          }}
        />
      )}
      {modal === "explore" && (
        <Modal title="同一个想法，六种可能。" wide close={() => setModal(null)}>
          <p className="muted">
            真实活动内容同步预览，选择最适合这场活动的视觉语言。应用后可撤销。
          </p>
          <div className="explore-grid">
            {(Object.keys(themes) as Theme[]).map((theme) => {
              const variant = {
                ...project,
                current: { ...project.current, theme },
              };
              const view = renderPoster(variant, format);
              return (
                <button
                  key={theme}
                  className="explore-card"
                  aria-label={"应用" + themes[theme].name}
                  onClick={() => {
                    edit((s) => (s.theme = theme));
                    setModal(null);
                    message("风格已应用，活动信息保持一致");
                  }}
                >
                  <div dangerouslySetInnerHTML={{ __html: view.svg }} />
                  <span>
                    <b>{themes[theme].name}</b>
                    <small>
                      {view.issues.some((i) => i.level === "error")
                        ? "仍需精简内容"
                        : themes[theme].tag}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {modal === "history" && (
        <Modal title="版本时间线" close={() => setModal(null)}>
          <p className="muted">
            恢复会创建新版本，当前内容会被保留。最多保留20个快照。
          </p>
          <div className="version-row current">
            <div>
              <b>当前版本</b>
              <small>{new Date(project.updated).toLocaleString("zh-CN")}</small>
            </div>
            <Check size={17} />
          </div>
          {project.history.map((s, i) => (
            <div className="version-row" key={s.id + "-" + i}>
              <div>
                <b>{s.label}</b>
                <small>
                  {new Date(s.created).toLocaleString("zh-CN")} ·{" "}
                  {s.brief.title}
                </small>
              </div>
              <button
                className="outline small"
                onClick={() => {
                  const next = clone(project);
                  next.current = clone(s);
                  apply(next, "恢复历史版本");
                  setModal(null);
                  message("历史版本已恢复");
                }}
              >
                恢复
              </button>
            </div>
          ))}
          {!project.history.length && (
            <p className="muted">点击“存为版本”留下一个创作节点。</p>
          )}
        </Modal>
      )}
      {modal === "export" && (
        <Modal
          title="让作品，走向更多地方。"
          close={() => !busy && setModal(null)}
        >
          <div className="export-options">
            {(["png", "svg", "pack"] as const).map((k) => (
              <button
                key={k}
                aria-pressed={exportKind === k}
                onClick={() => setExportKind(k)}
              >
                {k === "pack" ? <Layers size={24} /> : <ImageIcon size={24} />}
                <b>
                  {k === "png"
                    ? "高清 PNG"
                    : k === "svg"
                      ? "可编辑 SVG"
                      : "整套活动包"}
                </b>
                <small>
                  {k === "pack"
                    ? "3张 PNG + 项目 + 文案"
                    : k === "svg"
                      ? "文字保持独立元素"
                      : formats[format].name + " · 原始尺寸"}
                </small>
              </button>
            ))}
          </div>
          <div className="export-checks">
            {(exportKind === "pack"
              ? allIssues
              : allIssues.filter((x) => x.format === format)
            ).map((r) => (
              <div key={r.format}>
                <span>{formats[r.format].name}</span>
                <span>
                  {r.issues.some((i) => i.level === "error")
                    ? "需修复排版"
                    : "可导出"}
                </span>
              </div>
            ))}
          </div>
          <p className="fineprint">
            SVG 内嵌授权字体，文件较大。活动信息及素材使用权由创作者确认。
          </p>
          <button
            className="primary full"
            disabled={
              !!busy ||
              !ready ||
              (exportKind === "pack"
                ? allIssues.some((r) =>
                    r.issues.some((i) => i.level === "error"),
                  )
                : rendered.issues.some((i) => i.level === "error"))
            }
            onClick={runExport}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Download size={17} />
            )}{" "}
            {busy || "下载作品"}
          </button>
          <button className="text-button full" onClick={backup}>
            <FileJson size={15} />
            仅备份可编辑项目
          </button>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="工作空间与 AI 服务" close={() => setModal(null)}>
          <div className="settings-status">
            <Cloud size={26} />
            <div>
              <b>
                {service?.ai
                  ? "StepFun 服务已就绪"
                  : service
                    ? "本地服务已启动，AI 未配置"
                    : "独立前端模式"}
              </b>
              <p>
                {service?.ai
                  ? service.model
                  : "六套模板、编辑、检查和导出均可离线使用。"}
              </p>
            </div>
          </div>
          {service && (
            <p className="muted">
              本地服务预算：¥{service.budget.toFixed(2)}，已结算 ¥
              {service.spent.toFixed(4)}，预留 ¥{service.reserved.toFixed(4)}。
            </p>
          )}
          <p className="fineprint">
            API
            密钥只从服务端环境读取，不在浏览器输入或保存。此版本用于本机个人创作，尚未提供公网账号与团队协作。
          </p>
          <label className="label">
            动态效果
            <select
              value={motionLevel}
              onChange={(e) => {
                const n = Number(e.target.value);
                setMotionLevel(n);
                setting("motion", n).catch(() => {});
              }}
            >
              <option value={2}>华丽 · 光场与浮动</option>
              <option value={1}>轻盈 · 仅保留交互转场</option>
              <option value={0}>静止 · 减少动态</option>
            </select>
          </label>
          <div className="button-row">
            <button
              className="outline"
              onClick={() =>
                status()
                  .then((s) => {
                    setService(s);
                    message("服务状态已刷新");
                  })
                  .catch(() => message("服务端尚未启动"))
              }
            >
              刷新服务状态
            </button>
            <button className="outline" onClick={backup}>
              备份当前项目
            </button>
          </div>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="带回灵感，或批量开始。" close={() => setModal(null)}>
          <p className="muted">
            导入 PosterLab 项目 JSON，或最多30行的活动 CSV。导入会创建副本。
          </p>
          <label className="upload-drop big">
            <Upload size={32} />
            <span>
              选择项目或 CSV 文件<small>JSON / CSV · 最大25MB</small>
            </span>
            <input
              aria-label="导入项目文件"
              type="file"
              accept=".json,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
              }}
            />
          </label>
          <button
            className="text-button"
            onClick={() =>
              download(
                new Blob(
                  [
                    "\uFEFFtitle,speaker,date,time,venue,description,cta,url\n设计开放日,创意社区,2026-11-08,14:00–16:00,创意空间,一起探索设计的新可能,欢迎参加,\n",
                  ],
                  { type: "text/csv;charset=utf-8" },
                ),
                "posterlab-活动导入模板.csv",
              )
            }
          >
            下载 CSV 模板 <Download size={15} />
          </button>
          <p className="fineprint">
            旧版同源作品会自动迁入；不同网址的浏览器存储无法自动读取。原版仍保留在
            legacy/。
          </p>
        </Modal>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <CheckCircle2 size={17} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
function SuggestionModal({
  project,
  suggestion,
  close,
  confirm,
}: {
  project: Project;
  suggestion: Suggestion;
  close: () => void;
  confirm: (s: Suggestion, unlock: boolean) => void;
}) {
  const [allowLocked, setAllowLocked] = useState(false);
  const extraction =
    suggestion.reason.includes("导入") || suggestion.reason.includes("提取");
  const locked = Object.keys(suggestion.fields).some((k) =>
    project.current.locked.includes(k as Field),
  );
  return (
    <Modal
      title={extraction ? "核对活动信息" : "先看变化，再应用。"}
      close={close}
    >
      <p className="muted">
        {suggestion.source === "stepfun" ? "AI 建议" : "本地规则"} ·{" "}
        {suggestion.reason}
      </p>
      <div className="diff-list">
        {Object.entries(suggestion.fields).map(([k, v]) => (
          <div key={k}>
            <span>
              {labels[k as Field] || k}
              {project.current.locked.includes(k as Field) && (
                <LockKeyhole size={12} />
              )}
            </span>
            <del>{project.current.brief[k as Field] || "空"}</del>
            <strong>{String(v) || "空"}</strong>
          </div>
        ))}
        {suggestion.theme && (
          <div>
            <span>视觉风格</span>
            <del>{themes[project.current.theme].name}</del>
            <strong>{themes[suggestion.theme].name}</strong>
          </div>
        )}
        {suggestion.titleScale && (
          <div>
            <span>标题比例</span>
            <del>{Math.round(project.current.titleScale * 100)}%</del>
            <strong>{Math.round(suggestion.titleScale * 100)}%</strong>
          </div>
        )}
      </div>
      {locked && extraction ? (
        <label className="check-label">
          <input
            type="checkbox"
            checked={allowLocked}
            onChange={(e) => setAllowLocked(e.target.checked)}
          />
          我已核对，允许本次导入更新已锁定字段
        </label>
      ) : (
        locked && <p className="fineprint">锁定字段会被跳过，保留原值。</p>
      )}
      <div className="button-row">
        <button className="outline" onClick={close}>
          暂不修改
        </button>
        <button
          className="primary"
          onClick={() => confirm(suggestion, extraction && allowLocked)}
        >
          应用到整套物料 <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
export default App;
