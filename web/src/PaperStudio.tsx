import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  Clipboard,
  Download,
  FileText,
  FileUp,
  MessageCircle,
  NotebookPen,
  PencilLine,
  Quote,
  ScanText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { paperEntries, openPaper, keepPaper } from "./paper-library";
import { writePaper } from "./outreach";
import PaperFigure from "./PaperFigure";
import { CampaignNav } from "./CampaignNav";
import {
  channels,
  channelCopy,
  wordingToReview,
  createPaper,
  examplePaper,
  paperKey,
  platforms,
  prepareText,
  recoverPaper,
  sentences,
  type Paper,
  type Channel,
} from "./paper-model";
import { drawPaper, paperPack, paperPng } from "./paper-art";
import { adaptEvidence, adaptChannel } from "./paper-assist";
import { download } from "./render";
import { studioFetch, STATIC_DEMO } from "./studio-api";
import twitterText from "twitter-text";
import "./paper.css";

const icons = {
  x: FileText,
  red: NotebookPen,
  moments: MessageCircle,
  wechat: BookOpen,
};
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog
      className="pr-dialog"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
    >
      <div className="pr-dialoghead">
        <h2>{title}</h2>
        <button aria-label="关闭" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Art({ paper, channel }: { paper: Paper; channel: Channel }) {
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    target.current?.replaceChildren();
    drawPaper(paper, channel)
      .then((canvas) => {
        if (live) target.current?.replaceChildren(canvas);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [
    paper.title,
    paper.headline,
    paper.sample,
    paper.figure,
    paper.evidence,
    channel,
  ]);
  return (
    <div
      className="pr-art"
      role="img"
      aria-label={platforms[channel].name + "配图预览"}
      style={
        {
          aspectRatio:
            platforms[channel].width + "/" + platforms[channel].height,
          "--ratio": platforms[channel].width / platforms[channel].height,
        } as CSSProperties
      }
      ref={target}
    >
      {failed ? "配图未能载入，请刷新后重试。" : null}
    </div>
  );
}
function ImportPaper({
  close,
  apply,
  fileFirst,
  ai,
}: {
  close: () => void;
  apply: (p: Paper, file?: File) => void;
  fileFirst: boolean;
  ai: boolean;
}) {
  const [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [byline, setByline] = useState(""),
    [reading, setReading] = useState(false),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const [useModel, setUseModel] = useState(true),
    [generating, setGenerating] = useState(false);
  const generateLock = useRef(false);
  const openFile = useRef<File | undefined>(undefined),
    file = useRef<HTMLInputElement>(null),
    inFlight = useRef(0);
  useEffect(
    () => () => {
      inFlight.current++;
    },
    [],
  );
  async function read(f?: File) {
    if (!f) return;
    const ticket = ++inFlight.current;
    setError("");
    setReading(true);
    try {
      if (f.size > 40 * 1024 * 1024)
        throw Error("请选择 40 MB 以内的文件，或粘贴摘要。");
      const pdf = /\.pdf$/i.test(f.name);
      if (!pdf && !/\.(?:txt|md)$/i.test(f.name))
        throw Error("支持 PDF、TXT 和 Markdown 文件。");
      const d = pdf
        ? await (await import("./paper-pdf")).readPdf(f)
        : prepareText(await f.text());
      if (d.body.length > 140000)
        throw Error("文本较长，请选取摘要或要传播的章节。");
      if (ticket !== inFlight.current) return;
      openFile.current = pdf ? f : undefined;
      setText(d.body);
      setTitle(d.title || f.name.replace(/\.[^.]+$/, ""));
      setUrl(d.source);
      setByline("byline" in d && typeof d.byline === "string" ? d.byline : "");
      setLabel(
        f.name +
          (pdf ? " · 已从前五页内提取，请核对标题和摘要" : " · 已读取文本"),
      );
    } catch (e) {
      if (ticket === inFlight.current)
        setError((e as Error).message || "无法读取这个文件。");
    } finally {
      if (ticket === inFlight.current) setReading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function generate() {
    if (generateLock.current) return;
    generateLock.current = true;
    setGenerating(true);
    setError("");
    try {
      const extracted = prepareText(text);
      const p = createPaper(
        label || (title.trim() && !extracted.title) ? text : extracted.body,
        title.trim() || extracted.title,
        url.trim() || extracted.source,
        byline,
      );
      const kit = ai && useModel ? await writePaper(p, crypto.randomUUID()) : p;
      apply(kit, openFile.current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      generateLock.current = false;
      setGenerating(false);
    }
  }
  return (
    <Dialog
      title="导入论文"
      close={() => {
        if (!generating) close();
      }}
    >
      <fieldset className="ds-fieldset" disabled={generating}>
        <p className="pr-help">
          导入带文本层的 PDF，或直接粘贴标题和摘要。文件在此浏览器中读取。
        </p>
        <input
          type="file"
          ref={file}
          accept=".pdf,.txt,.md"
          hidden
          aria-label="选择论文文件"
          onChange={(e) => read(e.target.files?.[0])}
        />
        <button
          className={"pr-drop" + (drag ? " drag" : "")}
          disabled={reading}
          autoFocus={fileFirst}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            read(e.dataTransfer.files[0]);
          }}
          onClick={() => file.current?.click()}
        >
          <Upload size={22} />
          <b>{reading ? "正在提取文本…" : "选择或拖入论文文件"}</b>
          <small>PDF、TXT、MD · 最大 40 MB</small>
        </button>
        {label && <p className="pr-help">{label}</p>}
        <label>
          论文标题
          <input
            value={title}
            maxLength={500}
            placeholder="也可写在下方文本的第一行"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          摘要或论文原文
          <textarea
            rows={6}
            autoFocus={!fileFirst}
            value={text}
            maxLength={140000}
            placeholder={"论文标题\n在这里粘贴中文或英文摘要……"}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          原文链接 <small>选填</small>
          <input
            type="url"
            value={url}
            maxLength={1200}
            placeholder="https://doi.org/…"
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <details className="pr-verification">
          <summary>作者和出版信息（选填）</summary>
          <label>
            作者、期刊、年份
            <input
              value={byline}
              maxLength={240}
              onChange={(e) => setByline(e.target.value)}
            />
          </label>
        </details>
        {ai && (
          <label className="ds-model-option">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
            />
            <span>
              使用 StepFun 撰写四个平台的文案
              <small>仅发送标题、署名和从原文提取的句子</small>
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="pr-error">
            {error}
          </p>
        )}
        <button
          className="pr-action"
          disabled={reading || generating || !text.trim()}
          onClick={generate}
        >
          {generating ? "正在生成宣传材料…" : "生成四套宣传材料"}{" "}
          <ArrowUpRight size={16} />
        </button>
      </fieldset>
    </Dialog>
  );
}
function CopyEditor({
  paper,
  channel,
  initial,
  ai,
  close,
  apply,
  selectText,
}: {
  paper: Paper;
  channel: Channel;
  initial: string;
  ai: boolean;
  close: () => void;
  apply: (text: string) => void;
  selectText: boolean;
}) {
  const [value, setValue] = useState(initial),
    [state, setState] = useState(""),
    [working, setWorking] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (selectText) field.current?.select();
  }, []);
  async function adapt() {
    setWorking(true);
    setState("");
    try {
      setValue(await adaptChannel(paper, channel, key.current));
      setState("已生成平台草稿，请对照下方原句后保存。");
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const valid =
    value.trim() &&
    !(
      channel === "x" &&
      value
        .split(/\n\s*\n/)
        .some((s) => twitterText.parseTweet(s).weightedLength > 280)
    );
  if (selectText)
    return (
      <Dialog title="复制文案" close={close}>
        <p className="pr-help">文字已选中，可使用系统复制命令。</p>
        <textarea
          ref={field}
          aria-label="待复制文案"
          readOnly
          value={initial}
          rows={8}
        />
      </Dialog>
    );
  return (
    <Dialog title={"编辑" + platforms[channel].name + "文案"} close={close}>
      {ai && (
        <div className="pr-ai">
          <button disabled={working} onClick={adapt}>
            <Sparkles size={16} />
            {working
              ? "正在改写…"
              : "按" + platforms[channel].name + "风格改写"}
          </button>
          <small>将论文标题和选中原句发送给 StepFun。</small>
        </div>
      )}
      <label>
        发布文案
        <textarea
          autoFocus
          ref={field}
          rows={10}
          maxLength={18000}
          value={value}
          disabled={working}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {channel === "x" && (
        <p className="pr-help">空行分隔短帖，每帖最多 280 个加权字符。</p>
      )}
      {state && (
        <p role="status" className="pr-help">
          {state}
        </p>
      )}
      <details className="pr-verification">
        <summary>对照论文原句</summary>
        {paper.evidence.map((e, i) => (
          <p key={i}>
            {i + 1}. {e.quote}
          </p>
        ))}
      </details>
      <button
        className="pr-action"
        disabled={working || !valid}
        onClick={() => apply(value.trim())}
      >
        保存文案 <Check size={16} />
      </button>
    </Dialog>
  );
}
function Evidence({
  channel,
  paper,
  close,
  apply,
  ai,
}: {
  paper: Paper;
  channel: Channel;
  close: () => void;
  apply: (p: Paper) => void;
  ai: boolean;
}) {
  const [headline, setHeadline] = useState(paper.headline),
    [evidence, setEvidence] = useState(() =>
      paper.evidence.map((e) => ({ ...e })),
    ),
    [state, setState] = useState(""),
    [working, setWorking] = useState(false);
  const all = useMemo(
    () => [
      ...new Set([
        ...paper.evidence.map((e) => e.quote),
        ...sentences(paper.body),
      ]),
    ],
    [paper],
  );
  const request = useRef({ fingerprint: "", key: "" });
  function change(index: number, quote: string, line: string) {
    setEvidence((items) =>
      items.map((e, i) => (i === index ? { quote, line } : e)),
    );
    setState("");
  }
  async function rewrite() {
    setWorking(true);
    setState("");
    try {
      const fingerprint = JSON.stringify([
        paper.title,
        evidence.map((e) => e.quote),
      ]);
      if (request.current.fingerprint !== fingerprint)
        request.current = { fingerprint, key: crypto.randomUUID() };
      const data = await adaptEvidence(
        { ...paper, evidence },
        request.current.key,
      );
      setHeadline(data.headline);
      setEvidence(evidence.map((e, i) => ({ ...e, line: data.lines[i] })));
      setState("已生成中文草稿。请逐句对照后应用。");
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <Dialog title="核对原句与传播表述" close={close}>
      <p className="pr-help">
        {paper.evidenceIds?.[channel]?.length
          ? platforms[channel].name +
            " 初稿引用了第 " +
            paper.evidenceIds[channel]!.join("、") +
            " 句。请对照原句核对数字、比较方向和结论范围。"
          : "可对照下方原句核对发布文案。修改传播表述会更新四个平台的本地摘录稿。"}
      </p>
      <label>
        中文平台封面标题
        <input
          disabled={working}
          value={headline}
          maxLength={500}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </label>
      {evidence.map((e, i) => (
        <section className="pr-evidence" key={i}>
          <label>
            论文原句 {i + 1}
            <select
              disabled={working}
              value={e.quote}
              onChange={(v) => change(i, v.target.value, v.target.value)}
            >
              {all.map((s, n) => (
                <option key={n} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <blockquote>{e.quote}</blockquote>
          <label>
            传播表述 {i + 1}
            <textarea
              rows={2}
              value={e.line}
              maxLength={3000}
              disabled={working}
              onChange={(v) => change(i, e.quote, v.target.value)}
            />
          </label>
        </section>
      ))}
      {ai && (
        <div className="pr-ai">
          <button disabled={working} onClick={rewrite}>
            <Sparkles size={15} />
            {working ? "正在改写…" : "AI 辅助中文改写"}
          </button>
          <small>仅将标题及以上原句发送给已连接的 StepFun。</small>
        </div>
      )}
      {state && (
        <p role="status" className="pr-help">
          {state}
        </p>
      )}
      <button
        className="pr-action"
        disabled={
          working || !headline.trim() || evidence.some((e) => !e.line.trim())
        }
        onClick={() =>
          apply(
            JSON.stringify(evidence) === JSON.stringify(paper.evidence)
              ? { ...paper, headline: headline.trim() }
              : {
                  ...paper,
                  headline: headline.trim(),
                  evidence,
                  model: undefined,
                  evidenceIds: undefined,
                  edits: {},
                },
          )
        }
      >
        {JSON.stringify(evidence) === JSON.stringify(paper.evidence)
          ? "完成核对"
          : Object.keys(paper.edits).length
            ? "用更新后的摘录替换四个平台的文案"
            : "应用到四个平台"}{" "}
        <Check size={16} />
      </button>
    </Dialog>
  );
}
function PaperLibrary({
  apply,
  close,
}: {
  apply: (p: Paper) => void;
  close: () => void;
}) {
  const [items, setItems] = useState<Awaited<ReturnType<typeof paperEntries>>>(
      [],
    ),
    [message, setMessage] = useState("正在读取…");
  useEffect(() => {
    paperEntries()
      .then((rows) => {
        setItems(rows);
        setMessage(rows.length ? "" : "还没有保存的论文。");
      })
      .catch(() => setMessage("浏览器暂时无法打开论文库。"));
  }, []);
  return (
    <Dialog title="我的论文" close={close}>
      <p className="pr-help">
        在此浏览器打开过的论文，可以继续编辑配图和发布文案。
      </p>
      {message && <p>{message}</p>}
      <div className="pr-library">
        {items.map((entry) => (
          <button
            key={entry.id}
            onClick={() =>
              openPaper(entry.id)
                .then(apply)
                .catch(() => setMessage("这份草稿无法读取。"))
            }
          >
            <FileText size={17} />
            <span>{entry.title}</span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
export default function PaperStudio() {
  const [paper, setPaper] = useState<Paper>(() => {
      try {
        return recoverPaper(localStorage.getItem(paperKey));
      } catch {
        return examplePaper();
      }
    }),
    [channel, setChannel] = useState<Channel>("red"),
    [modal, setModal] = useState<
      | "file"
      | "paste"
      | "evidence"
      | "copy"
      | "preview"
      | "figure"
      | "library"
      | null
    >(null);
  const [edit, setEdit] = useState(""),
    [manualSelect, setManualSelect] = useState(false),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [ai, setAi] = useState(false);
  const originalFile = useRef<File | undefined>(undefined);
  const result = useRef<HTMLElement>(null),
    lock = useRef(false);
  const copy = useMemo(() => channelCopy(paper, channel), [paper, channel]);
  const reviewTerms = paper.model ? wordingToReview(paper, channel) : [];
  const channelInfo = platforms[channel];
  useEffect(() => {
    if (location.hash === "#papers/import") {
      setModal("file");
      history.replaceState(null, "", "#papers");
    }
    document.title = "论文传播 · PosterLab";
    window.scrollTo(0, 0);
    let live = true;
    if (!STATIC_DEMO)
      studioFetch("/status")
        .then((r) => r.json())
        .then((d) => {
          if (live) setAi(d.ai === true);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    keepPaper(paper).catch(() =>
      setMessage("当前浏览器无法保存到论文库，请下载备份。"),
    );
    try {
      localStorage.setItem(paperKey, JSON.stringify(paper));
    } catch {
      setMessage("浏览器未能保存草稿，请及时下载整套宣传材料。");
    }
  }, [paper]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5500);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const name =
    paper.headline.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 50) || "论文";
  async function save(which: "all" | "image") {
    if (lock.current) return;
    lock.current = true;
    setBusy(which);
    try {
      const blob =
        which === "all"
          ? await paperPack(paper)
          : await paperPng(paper, channel);
      download(
        blob,
        name +
          (which === "all"
            ? "-论文传播套装.zip"
            : "-" + channelInfo.name + ".png"),
      );
      setMessage("文件已下载");
    } catch (e) {
      setMessage((e as Error).message || "导出失败，请重试。");
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function clipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("文案已复制");
    } catch {
      setManualSelect(true);
      setEdit(text);
      setModal("copy");
      setMessage("已选中文案，可手动复制");
    }
  }
  const posts = channel === "x" ? copy.split(/\n\s*\n/).filter(Boolean) : [];
  return (
    <div className="campaign pr-page ds-workroom">
      <CampaignNav active="papers" onPapers={() => setModal("library")} />
      <main className="cp-shell pr-shell">
        <section
          className={
            "pr-hero " +
            (paper.sample && !paper.figure ? "pr-space" : "pr-generic")
          }
        >
          <div className="pr-hero-copy">
            <div className="pr-eyebrow">
              <span /> 科研论文传播
            </div>
            <h1>
              导入一篇论文，
              <br />
              四套宣传材料<span>。</span>
            </h1>
            <p>
              把论文变成 X
              短帖串、小红书笔记、朋友圈分享卡和公众号导读。每个平台都有自己的文案与配图。
            </p>
            <div className="pr-actions">
              <button className="pr-import" onClick={() => setModal("file")}>
                <FileUp size={17} />
                导入论文 PDF
              </button>
              <button className="pr-paste" onClick={() => setModal("paste")}>
                <Clipboard size={16} />
                粘贴摘要
              </button>
            </div>
          </div>
          <div className="pr-figure">
            {paper.figure ? (
              <>
                <img
                  className="pr-userfig"
                  src={paper.figure.data}
                  alt={paper.figure.credit}
                />
                <div className="pr-figcaption">{paper.figure.credit}</div>
              </>
            ) : paper.sample ? (
              <>
                <img
                  src={import.meta.env.BASE_URL + "papers/m87.jpg"}
                  alt="事件视界望远镜观测到的 M87 星系中心明亮圆环与中央暗区"
                />
                <div className="pr-figcaption">
                  <strong>M87*</strong>
                  <span>事件视界望远镜合作组 · 2019</span>
                  <a
                    href="https://www.eso.org/public/images/eso1907a/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    图像来源 · CC BY 4.0 <ArrowUpRight size={12} />
                  </a>
                </div>
              </>
            ) : (
              <div className="pr-activepaper">
                <Quote />
                <small>当前论文</small>
                <strong>{paper.title}</strong>
              </div>
            )}
          </div>
        </section>
        <section className="pr-results" ref={result}>
          <div className="pr-resultshead">
            <div>
              <div className="pr-eyebrow">
                <span />
                {paper.model
                  ? "StepFun · " + paper.model
                  : paper.sample
                    ? "示例论文 · 已生成"
                    : "本地摘录 · 已生成"}
              </div>
              <h2>{paper.headline}</h2>
            </div>
            <button
              className="pr-action"
              disabled={!!busy}
              onClick={() => save("all")}
            >
              <Download size={16} />
              {busy === "all" ? "正在打包…" : "下载整套 ZIP"}
            </button>
          </div>
          <div className="pr-tabs" aria-label="发布平台">
            {channels.map((c) => {
              const Icon = icons[c];
              return (
                <button
                  key={c}
                  aria-pressed={channel === c}
                  onClick={() => setChannel(c)}
                >
                  <Icon size={17} />
                  <b>{platforms[c].name}</b>
                  <span>{platforms[c].type}</span>
                </button>
              );
            })}
          </div>
          <div className="pr-workspace">
            <section className="pr-vis">
              <div className="pr-panelhead">
                <h3>发布配图</h3>
                <small>
                  {channelInfo.width} × {channelInfo.height}
                </small>
                <button onClick={() => setModal("figure")}>
                  <ScanText size={15} />
                  {paper.figure ? "更换论文插图" : "选取论文插图"}
                </button>
              </div>
              <button
                className="pr-mat"
                aria-label="放大发布配图"
                onClick={() => setModal("preview")}
              >
                <Art paper={paper} channel={channel} />
              </button>
              <div className="pr-panelactions">
                <span>{channelInfo.ratio} · PNG</span>
                <button disabled={!!busy} onClick={() => save("image")}>
                  <ArrowDownToLine size={15} />
                  下载配图
                </button>
              </div>
            </section>
            <section className="pr-writing">
              <div className="pr-panelhead">
                <h3>{channelInfo.type}文案</h3>
                {ai && (
                  <button
                    onClick={() => {
                      setManualSelect(false);
                      setEdit(copy);
                      setModal("copy");
                    }}
                  >
                    <Sparkles size={15} />
                    平台改写
                  </button>
                )}
                <button
                  onClick={() => {
                    setManualSelect(false);
                    setEdit(copy);
                    setModal("copy");
                  }}
                >
                  <PencilLine size={15} />
                  编辑
                </button>
              </div>
              {reviewTerms.length > 0 && (
                <button
                  className="pr-reviewnote"
                  onClick={() => setModal("evidence")}
                >
                  <ScanText size={15} />
                  <span>
                    <b>建议对照原句</b>　
                    {reviewTerms.map((t) => "「" + t + "」").join("、")}
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              )}
              <div className="pr-copy">
                {channel === "x" ? (
                  posts.map((s, i) => (
                    <div className="pr-post" key={i}>
                      <p>{s}</p>
                      <button onClick={() => clipboard(s)}>
                        复制第 {i + 1} 帖{" "}
                        <small>
                          {twitterText.parseTweet(s).weightedLength}/280
                        </small>
                      </button>
                    </div>
                  ))
                ) : (
                  <p>{copy}</p>
                )}
              </div>
              <div className="pr-panelactions">
                <button onClick={() => setModal("evidence")}>
                  <ScanText size={16} />
                  核对原句{" "}
                  {paper.evidenceIds?.[channel]?.join("、") ||
                    "· " + paper.evidence.length}
                </button>
                <button onClick={() => clipboard(copy)}>
                  <Clipboard size={15} />
                  复制文案
                </button>
              </div>
            </section>
          </div>
          <div className="pr-source">
            <Quote size={18} />
            <div>
              <b>论文出处</b>
              <p>{paper.title}</p>
              {paper.byline && <p>{paper.byline}</p>}
            </div>
            {paper.source && (
              <a href={paper.source} target="_blank" rel="noreferrer">
                阅读原文 <ArrowUpRight size={13} />
              </a>
            )}
          </div>
        </section>
      </main>
      {(modal === "file" || modal === "paste") && (
        <ImportPaper
          ai={ai}
          fileFirst={modal === "file"}
          close={() => setModal(null)}
          apply={(p, f) => {
            originalFile.current = f;
            setPaper(p);
            setModal(null);
            setMessage("四个平台的宣传材料已生成");
            requestAnimationFrame(() =>
              result.current?.scrollIntoView({ block: "start" }),
            );
          }}
        />
      )}
      {modal === "evidence" && (
        <Evidence
          channel={channel}
          paper={paper}
          ai={ai}
          close={() => setModal(null)}
          apply={(p) => {
            setPaper(p);
            setModal(null);
            setMessage("配图与文案已更新");
          }}
        />
      )}
      {modal === "copy" && (
        <CopyEditor
          paper={paper}
          channel={channel}
          initial={edit}
          ai={ai}
          selectText={manualSelect}
          close={() => setModal(null)}
          apply={(text) => {
            const evidenceIds = { ...paper.evidenceIds };
            delete evidenceIds[channel];
            setPaper({
              ...paper,
              evidenceIds,
              edits: { ...paper.edits, [channel]: text },
            });
            setModal(null);
          }}
        />
      )}
      {modal === "library" && (
        <PaperLibrary
          close={() => setModal(null)}
          apply={(p) => {
            if (p.id !== paper.id) originalFile.current = undefined;
            setPaper(p);
            setModal(null);
          }}
        />
      )}
      {modal === "figure" && (
        <Dialog title="选取论文插图" close={() => setModal(null)}>
          {paper.figure && (
            <button
              className="pr-reset"
              onClick={() => {
                const next = { ...paper };
                delete next.figure;
                setPaper(next);
                setModal(null);
              }}
            >
              移除自选插图
            </button>
          )}
          <PaperFigure
            file={originalFile.current}
            apply={(figure) => {
              setPaper({ ...paper, figure });
              setModal(null);
              setMessage("四个平台的配图已更新");
            }}
          />
        </Dialog>
      )}
      {modal === "preview" && (
        <Dialog title={channelInfo.name + "配图"} close={() => setModal(null)}>
          <div className="pr-fullart">
            <Art paper={paper} channel={channel} />
          </div>
          <button
            className="pr-action"
            disabled={!!busy}
            onClick={() => save("image")}
          >
            <Download size={16} />
            下载 PNG
          </button>
        </Dialog>
      )}
      {message && (
        <div className="pr-toast" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
