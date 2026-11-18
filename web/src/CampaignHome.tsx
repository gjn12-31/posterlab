import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  Clipboard,
  Download,
  Expand,
  LayoutTemplate,
  LoaderCircle,
  MessageCircle,
  MousePointer2,
  Pencil,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  X,
} from "lucide-react";
import {
  campaigns,
  chooseEdition,
  draftKey,
  invitation,
  noticeFromBrief,
  parseNotice,
  readCampaign,
  changeNotice,
  type Draft,
} from "./campaign-model";
import { campaignTag } from "./campaign-design";
import { makeCover } from "./cover";
import { editions, type Edition } from "./editions";
import {
  formats,
  briefSchema,
  labels,
  type Project,
  type Brief,
  type Format,
} from "./model";
import {
  download,
  exportBlob,
  exportPack,
  loadFonts,
  renderPoster,
} from "./render";
import { getProject, saveCampaignProject } from "./storage";
import { connectedModel, writeCampaign } from "./outreach";
import { CampaignNav } from "./CampaignNav";

const channels: {
  id: Format;
  name: string;
  use: string;
  icon: typeof Square;
}[] = [
  {
    id: "portrait",
    name: "竖版海报",
    use: "群聊、线下张贴",
    icon: RectangleVertical,
  },
  { id: "square", name: "社交方图", use: "朋友圈、社交动态", icon: Square },
  {
    id: "landscape",
    name: "横版封面",
    use: "活动页、演示开场",
    icon: RectangleHorizontal,
  },
];
const styles: Edition[] = [
  "coffee",
  "vinyl",
  "nature",
  "bloom",
  "course",
  "launch",
  "afterglow",
];
const schedule = (b: Brief) => ({ date: b.date, time: b.time, venue: b.venue });
function Modal({
  name,
  close,
  children,
  large = false,
}: {
  name: string;
  close: () => void;
  children: ReactNode;
  large?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      className={"cp-dialog" + (large ? " cp-large" : "")}
      aria-label={name}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div>
        <header>
          <h2>{name}</h2>
          <button aria-label="关闭" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
function Proof({ svg }: { svg: string }) {
  return <div className="cp-proof" dangerouslySetInnerHTML={{ __html: svg }} />;
}
function hasChanges(a: Brief, b: Brief) {
  return a.date !== b.date || a.time !== b.time || a.venue !== b.venue;
}
function campaignProject(
  edition: Edition,
  brief: Brief,
  concept?: Draft["concept"],
) {
  const p = makeCover(edition, brief.title);
  p.current.layout = "campaign";
  p.current.campaignVersion = 2;
  p.current.displayTitle = concept?.tag || campaignTag(brief.title);
  if (concept)
    p.current.campaignCopy = {
      invitation: concept.invitation,
      model: concept.model,
      reason: concept.reason,
    };
  p.current.brief = { ...brief };
  return p;
}
export default function CampaignHome() {
  const [draft, setDraft] = useState<Draft>(readCampaign),
    [fontRev, setFontRev] = useState(0);
  const [modal, setModal] = useState<
      "facts" | "schedule" | "preview" | "qr" | null
    >(null),
    [editing, edit] = useState<Brief>(draft.brief),
    [selected, select] = useState<Format>("portrait");
  const [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [copied, setCopied] = useState(false),
    [copyTab, setCopyTab] = useState<"invite" | "update">("invite");
  const textarea = useRef<HTMLTextAreaElement>(null),
    busyRef = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [model, setModel] = useState(""),
    [useModel, setUseModel] = useState(true);
  useEffect(() => {
    let current = true;
    connectedModel().then((s) => {
      if (current) setModel(s);
    });
    return () => {
      current = false;
    };
  }, []);
  const dirty = draft.raw.trim() !== draft.applied.trim();
  const [linked, setLinked] = useState<Project>();
  const projectPending = !!draft.projectId && draft.projectId !== linked?.id;
  useEffect(() => {
    const id = draft.projectId;
    if (!id) return;
    let current = true;
    async function restore() {
      try {
        const p = await getProject(id!);
        if (!current) return;
        if (!p || p.current.layout !== "campaign" || !p.current.edition)
          throw Error();
        const brief = p.current.brief,
          edition = p.current.edition;
        setLinked(p);
        setDraft((d) => {
          if (d.projectId !== id) return d;
          if (
            JSON.stringify(brief) === JSON.stringify(d.brief) &&
            d.edition === edition
          )
            return d;
          const applied = noticeFromBrief(brief);
          return {
            ...d,
            brief,
            edition,
            concept: p.current.campaignCopy ? d.concept : undefined,
            applied,
            raw: d.raw === d.applied ? applied : d.raw,
            previous: hasChanges(d.brief, brief)
              ? schedule(d.brief)
              : d.previous,
          };
        });
      } catch {
        if (current) {
          setDraft((d) =>
            d.projectId === id ? { ...d, projectId: undefined } : d,
          );
          setFeedback("已从本地通知恢复宣传套装。");
        }
      }
    }
    restore();
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) restore();
    };
    window.addEventListener("pageshow", shown);
    return () => {
      current = false;
      window.removeEventListener("pageshow", shown);
    };
  }, [draft.projectId]);
  const project = useMemo(() => {
    if (linked && draft.projectId === linked.id) return linked;
    return campaignProject(draft.edition, draft.brief, draft.concept);
  }, [draft.edition, draft.brief, draft.concept, draft.projectId, linked]);
  const layouts = useMemo(
    () => ({
      portrait: renderPoster(project, "portrait"),
      square: renderPoster(project, "square"),
      landscape: renderPoster(project, "landscape"),
    }),
    [project, fontRev],
  );
  const updateCopy = draft.previous
    ? changeNotice(draft.previous, draft.brief)
    : "";
  const copy =
    copyTab === "update" && updateCopy
      ? updateCopy
      : invitation(draft.brief, project.current.campaignCopy?.invitation);
  const allErrors = Object.values(layouts).flatMap((l) =>
    l.issues.filter((i) => i.level === "error"),
  );
  useEffect(() => {
    const title = document.title;
    document.title = "PosterLab · 活动宣传制作台";
    window.scrollTo(0, 0);
    return () => {
      document.title = title;
    };
  }, []);
  useEffect(() => {
    let live = true;
    loadFonts([draft.brief.title, draft.brief.venue].join(""))
      .then(() => {
        if (live) setFontRev((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft.brief.title, draft.brief.venue]);
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      setFeedback("当前浏览器无法保存草稿，请及时下载套装。");
    }
  }, [draft]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function say(text: string) {
    setFeedback(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFeedback("");
      setCopied(false);
    }, 3500);
  }
  function generate(text: string, edition?: Edition) {
    run("generate", async () => {
      let brief: Brief;
      try {
        brief = parseNotice(text);
      } catch (error) {
        textarea.current?.focus();
        throw error;
      }
      const same =
        !!linked &&
        draft.projectId === linked.id &&
        brief.title === draft.brief.title;
      const aiPlan =
        !edition && useModel && model
          ? await writeCampaign(brief, crypto.randomUUID())
          : undefined;
      const next: Draft = {
        raw: text,
        applied: text,
        brief,
        concept: aiPlan,
        edition:
          edition ??
          aiPlan?.edition ??
          (same ? draft.edition : chooseEdition(text)),
      };
      let message = "三张宣传图和邀请文案已生成";
      if (!edition) {
        if (same) {
          next.projectId = linked.id;
          next.previous = hasChanges(draft.brief, brief)
            ? schedule(draft.brief)
            : draft.previous;
          await storeChanges(next);
        } else {
          try {
            const saved = await saveCampaignProject(
              campaignProject(next.edition, brief, next.concept),
            );
            next.projectId = saved.id;
            setLinked(saved);
          } catch {
            message = "成品已生成，作品库暂不可用，请下载备份。";
          }
          setDraft(next);
        }
        preview("portrait");
      } else setDraft(next);
      setCopied(false);
      setCopyTab("invite");
      say(message);
    });
  }
  function openFacts(mode: "schedule" | "facts" | "qr") {
    edit({ ...draft.brief });
    setError("");
    setModal(mode);
  }
  async function storeChanges(next: Draft) {
    if (linked && next.projectId === linked.id) {
      const snap = { ...linked.current, brief: next.brief };
      if (next.concept) {
        snap.campaignCopy = {
          model: next.concept.model,
          invitation: next.concept.invitation,
          reason: next.concept.reason,
        };
        if (next.concept.tag !== draft.concept?.tag)
          snap.displayTitle = next.concept.tag;
      } else delete snap.campaignCopy;
      if (next.edition !== snap.edition) {
        snap.edition = next.edition;
        snap.theme = editions[next.edition].theme;
        delete snap.heroId;
      }
      const saved = await saveCampaignProject(
        { ...linked, current: snap },
        linked.updated,
      );
      next = { ...next, projectId: saved.id };
      setLinked(saved);
    }
    setDraft(next);
  }
  function saveFacts() {
    if (!editing.title.trim()) {
      setError("请填写活动名称。");
      return;
    }
    const test = briefSchema.safeParse(editing);
    if (!test.success) {
      setError("请检查日期、文字长度或报名链接。");
      return;
    }
    const changed = hasChanges(draft.brief, editing),
      raw = noticeFromBrief(editing);
    run("update", async () => {
      await storeChanges({
        ...draft,
        concept: (["title", "description", "speaker", "cta"] as const).some(
          (f) => editing[f] !== draft.brief[f],
        )
          ? undefined
          : draft.concept,
        brief: { ...editing },
        raw,
        applied: raw,
        previous: changed ? schedule(draft.brief) : draft.previous,
      });
      setModal(null);
      setError("");
      setCopyTab(changed ? "update" : "invite");
      setCopied(false);
      say(changed ? "三张图已同步，改期通知也准备好了" : "活动信息已同步");
    });
  }
  function preview(f: Format) {
    select(f);
    setModal("preview");
  }
  async function run(action: string, fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || "操作未完成，请重试。");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  const name =
    draft.brief.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 48) ||
    "活动";
  function pack() {
    run("pack", async () => {
      download(
        await exportPack(project, () => {}, updateCopy),
        name + "-宣传套装.zip",
      );
      say("宣传套装已下载");
    });
  }
  function png(f: Format) {
    run(f, async () => {
      download(
        await exportBlob(project, f, "png"),
        name + "-" + formats[f].name + ".png",
      );
      say("图片已下载");
    });
  }
  function editor(f: Format) {
    run("edit", async () => {
      const p = await saveCampaignProject(
        { ...project, lastFormat: f },
        linked?.id === project.id ? linked.updated : undefined,
      );
      const next = { ...draft, projectId: p.id };
      setDraft(next);
      try {
        localStorage.setItem(draftKey, JSON.stringify(next));
      } catch {}
      location.assign("?mode=templates#open/" + p.id + "/" + f);
    });
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      say("文案已复制");
    } catch {
      const box = document.querySelector<HTMLTextAreaElement>(
        ".cp-message textarea",
      );
      box?.focus();
      box?.select();
      say("请复制已选中的文字");
    }
  }
  const inactive = dirty || !!busy || projectPending;
  return (
    <div className="campaign ds-workroom ds-campaign">
      <CampaignNav active="home" />
      <main className="cp-shell">
        <section className="cp-hero">
          <div className="cp-intro">
            <h1>活动宣传</h1>
            <p className="cp-lead">
              粘贴活动通知，制作竖版海报、社交方图、横幅与邀请文案。
            </p>
            <form
              className="cp-form"
              onSubmit={(e) => {
                e.preventDefault();
                generate(draft.raw);
              }}
            >
              <label htmlFor="cp-notice">
                <Pencil size={14} />
                活动通知{" "}
                {campaigns.some((c) => c.notice === draft.raw) && (
                  <small>示例，可直接替换</small>
                )}
              </label>
              <textarea
                ref={textarea}
                id="cp-notice"
                disabled={!!busy}
                maxLength={4000}
                rows={3}
                placeholder={
                  "活动叫什么？什么时候、在哪里举办？\n可直接粘贴通知，第一行写活动名称。"
                }
                value={draft.raw}
                onChange={(e) => {
                  setDraft({ ...draft, raw: e.target.value });
                  setError("");
                }}
              />
              {model && (
                <label className="ds-model-option">
                  <input
                    type="checkbox"
                    checked={useModel}
                    disabled={!!busy}
                    onChange={(e) => setUseModel(e.target.checked)}
                  />
                  <span>
                    StepFun 创意编排
                    <small>将活动信息发送给模型，用于选版和撰写邀请文案</small>
                  </span>
                </label>
              )}
              <div className="cp-formfoot">
                <button
                  type="button"
                  className="cp-clear"
                  onClick={() => {
                    setDraft({ ...draft, raw: "" });
                    setError("");
                    textarea.current?.focus();
                  }}
                >
                  清空
                </button>
                <button
                  className="cp-primary"
                  disabled={
                    !draft.raw.trim() ||
                    !!busy ||
                    projectPending ||
                    (!dirty && !!allErrors.length)
                  }
                >
                  {busy === "generate"
                    ? "正在生成…"
                    : model && useModel
                      ? "用 StepFun 生成海报"
                      : "生成并预览"}{" "}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
            <div className="cp-samples">
              <span>试个示例</span>
              {campaigns.map((c) => (
                <button
                  key={c.edition}
                  aria-pressed={draft.raw === c.notice}
                  disabled={!!busy}
                  onClick={() => generate(c.notice, c.edition)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {error && !modal && (
              <p className="cp-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="cp-board">
            <div className="cp-board-head">
              <span>
                <i />
                {dirty ? "上次生成的预览" : "成品预览"}
              </span>
              <button onClick={() => preview("portrait")}>
                <Expand size={14} /> 放大查看
              </button>
            </div>
            <div className="cp-spread" aria-label="三种画幅的实际成品">
              {channels.map((c) => (
                <button
                  key={c.id}
                  className={"cp-sheet cp-" + c.id}
                  aria-label={"放大" + c.name}
                  onClick={() => preview(c.id)}
                >
                  <Proof svg={layouts[c.id].svg} />
                </button>
              ))}
            </div>
            <div className="cp-board-foot">
              <span>三种画幅 · 同一场活动</span>
              <button onClick={() => openFacts("schedule")} disabled={inactive}>
                <CalendarClock size={15} /> 改时间地点
              </button>
            </div>
          </div>
        </section>
        <section
          className="cp-delivery"
          id="materials"
          aria-labelledby="cp-delivery-title"
        >
          <div className="cp-sectionhead">
            <div>
              <div className="cp-kicker">
                {project.current.campaignCopy
                  ? "StepFun · " + project.current.campaignCopy.model
                  : "发布材料"}
              </div>
              <h2 id="cp-delivery-title">{draft.brief.title}</h2>
            </div>
            <button
              className="cp-dark"
              onClick={pack}
              disabled={inactive || !!allErrors.length}
            >
              {busy === "pack" ? (
                <LoaderCircle className="cp-spin" size={16} />
              ) : (
                <Download size={16} />
              )}{" "}
              {busy === "pack" ? "正在打包" : "下载整套 ZIP"}
            </button>
          </div>
          {dirty && (
            <p className="cp-state">通知已修改。请重新生成，再下载新版。</p>
          )}
          {!!allErrors.length && (
            <p className="cp-error" role="alert">
              {allErrors[0].message}{" "}
              <button onClick={() => openFacts("facts")}>修改活动信息</button>
            </p>
          )}
          <div className="cp-deliverygrid">
            <div className="cp-files">
              <div className="cp-fileshead">
                <b>宣传图</b>
                <button
                  className="cp-textbutton"
                  onClick={() => openFacts("facts")}
                  disabled={inactive}
                >
                  <Pencil size={13} /> 修改活动信息
                </button>
              </div>
              {channels.map((c) => (
                <div className="cp-file" key={c.id}>
                  <button
                    className="cp-mini"
                    onClick={() => preview(c.id)}
                    aria-label={"预览" + c.name}
                  >
                    <Proof svg={layouts[c.id].svg} />
                  </button>
                  <div className="cp-filename">
                    <b>{c.name}</b>
                    <small>
                      {c.use} · {formats[c.id].width} × {formats[c.id].height}
                    </small>
                  </div>
                  <button
                    className="cp-textbutton cp-editlink"
                    disabled={inactive}
                    onClick={() => editor(c.id)}
                  >
                    编辑画布 <ArrowUpRight size={12} />
                  </button>
                  <button
                    className="cp-dlicon"
                    aria-label={"下载" + c.name + " PNG"}
                    disabled={
                      inactive ||
                      layouts[c.id].issues.some((i) => i.level === "error")
                    }
                    onClick={() => png(c.id)}
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                </div>
              ))}
              <div className="cp-style">
                <LayoutTemplate size={15} /> 视觉风格
                <select
                  aria-label="切换整套视觉风格"
                  value={draft.edition}
                  disabled={inactive}
                  onChange={(e) => {
                    const edition = e.target.value as Edition;
                    run("style", () => storeChanges({ ...draft, edition }));
                  }}
                >
                  {styles.map((id) => (
                    <option key={id} value={id}>
                      {editions[id].name}
                    </option>
                  ))}
                </select>
                <button
                  className="cp-qrlink"
                  type="button"
                  disabled={inactive}
                  onClick={(e) => {
                    e.preventDefault();
                    openFacts("qr");
                  }}
                >
                  {draft.brief.url ? "修改报名二维码" : "添加报名二维码"}{" "}
                  <ArrowUpRight size={12} />
                </button>
              </div>
              {draft.concept && draft.concept.edition === draft.edition && (
                <p className="ds-style-reason">
                  <b>StepFun 选版理由</b> {draft.concept.reason}
                </p>
              )}
            </div>
            <div className="cp-message">
              <div className="cp-fileshead">
                <b>
                  <MessageCircle size={17} /> 发布文案
                </b>
                <button
                  className="cp-textbutton"
                  disabled={inactive}
                  onClick={copyText}
                >
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}{" "}
                  {copied ? "已复制" : "复制文案"}
                </button>
              </div>
              <div className="cp-copytabs">
                <button
                  aria-pressed={copyTab === "invite" || !updateCopy}
                  onClick={() => {
                    setCopyTab("invite");
                    setCopied(false);
                  }}
                >
                  群聊邀请
                </button>
                {updateCopy && (
                  <button
                    aria-pressed={copyTab === "update"}
                    onClick={() => {
                      setCopyTab("update");
                      setCopied(false);
                    }}
                  >
                    改期通知
                  </button>
                )}
              </div>
              <textarea aria-label="发布文案" readOnly value={copy} />
            </div>
          </div>
        </section>
      </main>
      <footer className="cp-footer cp-shell">
        <b>PosterLab</b>
        <span>活动宣传制作台</span>
        <a href="#exhibitions">
          浏览灵感档案 <ArrowUpRight size={13} />
        </a>
      </footer>
      {(modal === "facts" || modal === "schedule" || modal === "qr") && (
        <Modal
          name={
            modal === "qr"
              ? "给三张图添加报名二维码"
              : modal === "schedule"
                ? "同步活动时间和地点"
                : "修改活动信息"
          }
          close={() => {
            setModal(null);
            setError("");
          }}
        >
          <p>
            {modal === "qr"
              ? "粘贴活动报名页的网址，保存后即可从宣传图扫码打开。清空网址会移除二维码。"
              : modal === "schedule"
                ? "保存后，三张宣传图会一起更新，并生成一段可转发的改期通知。"
                : "标题、时间和地点用于宣传图。详细介绍保留在发布文案中。"}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveFacts();
            }}
          >
            {(modal === "qr"
              ? (["url"] as const)
              : modal === "schedule"
                ? (["date", "time", "venue"] as const)
                : ([
                    "title",
                    "date",
                    "time",
                    "venue",
                    "speaker",
                    "url",
                    "cta",
                    "description",
                  ] as const)
            ).map((f) => (
              <label key={f}>
                {labels[f]}
                {f === "description" ? (
                  <textarea
                    value={editing[f]}
                    maxLength={1200}
                    onChange={(e) => edit({ ...editing, [f]: e.target.value })}
                  />
                ) : (
                  <input
                    type={f === "date" ? "date" : f === "url" ? "url" : "text"}
                    required={f === "title"}
                    value={editing[f]}
                    onChange={(e) => edit({ ...editing, [f]: e.target.value })}
                  />
                )}
              </label>
            ))}
            {error && (
              <p role="alert" className="cp-error">
                {error}
              </p>
            )}
            <button className="cp-primary" disabled={!!busy}>
              保存并同步 <Check size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "preview" && (
        <Modal large name="查看发布成品" close={() => setModal(null)}>
          <div className="cp-previewtabs">
            {channels.map((c) => (
              <button
                key={c.id}
                aria-pressed={selected === c.id}
                onClick={() => select(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="cp-zoom">
            <Proof svg={layouts[selected].svg} />
          </div>
          <div className="cp-previewactions">
            <span>
              {formats[selected].width} × {formats[selected].height}
            </span>
            <button
              className="cp-textbutton"
              disabled={inactive}
              onClick={() => editor(selected)}
            >
              拖动编辑 <MousePointer2 size={14} />
            </button>
            <button
              className="cp-dark"
              disabled={inactive || !!allErrors.length}
              onClick={pack}
            >
              下载整套 ZIP
            </button>
            <button
              className="cp-primary"
              disabled={
                inactive ||
                layouts[selected].issues.some((i) => i.level === "error")
              }
              onClick={() => png(selected)}
            >
              下载 PNG <Download size={14} />
            </button>
          </div>
          {error && (
            <p className="cp-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
      <div className={feedback ? "cp-toast" : "cp-sr"} role="status">
        {feedback}
      </div>
    </div>
  );
}
