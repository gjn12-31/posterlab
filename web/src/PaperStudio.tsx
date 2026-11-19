import WorkflowModels, { useWorkflowChoices } from "./WorkflowModels";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Download,
  FileText,
  FileUp,
  LoaderCircle,
  Quote,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  paperEntries,
  openPaper,
  resumePaper,
  restoreLibraryDraft,
  savePaperDraft,
} from "./paper-library";
import { writePaper } from "./outreach";
import { generatePaperArtwork } from "./paper-artwork";
import { extractSections } from "./paper-sections";
import PaperFigure from "./PaperFigure";
import PaperLayoutEditor from "./PaperLayoutEditor";
import {changePaperFigure} from "./paper-layout";
import PaperProcess from "./PaperProcess";
import WorkroomCases from "./WorkroomCases";
import { producePaper, preservePaperEdits } from "./paper-production";
import { RewritePaper, VoicePicker } from "./PaperVoice";
import Dialog from "./PaperDialog";
import PublicationDesk, { Art } from "./PublicationDesk";
import { articleFragment, noteParts } from "./paper-publication";
import exampleCopy from "./paper-example-copy.json";
import { clashbenchPath, openClashbenchCase } from "./clashbench-case";
import { paperKey } from "./paper-model";
import { cleanManuscriptText } from "./paper-clean";
import { CampaignNav } from "./CampaignNav";
import {
  channels,
  channelCopy,
  applyPaperDrafts,
  channelVoice,
  voiceNames,
  type PaperVoice,
  wordingToReview,
  createPaper,
  examplePaper,
  paperSchema,
  platforms,
  sentences,
  updateBibliography,
  type Paper,
  type Channel,
} from "./paper-model";
import { drawPaper, paperPack, paperPng, paperDrawio } from "./paper-art";
import { adaptEvidence, adaptChannel } from "./paper-assist";
import { download } from "./render";
import { studioFetch, STATIC_DEMO } from "./studio-api";
import twitterText from "twitter-text";
import "./paper.css";
import LiveStudioLink from "./LiveStudioLink";
import "./publicity-workroom.css";
import "./publication-desk.css";

type ModelState = "checking" | "ready" | "offline" | "unreachable";
const sectionLimit = 45000;

// Keep pasted evidence available for a deliberate edit when a browser would
// otherwise drop the end of an oversized paste at the native maxlength.
function preserveLongPaste(
  event: ClipboardEvent<HTMLTextAreaElement>,
  update: (value: string) => void,
) {
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  const pasted =
    value.slice(0, selectionStart) +
    event.clipboardData.getData("text/plain") +
    value.slice(selectionEnd);
  if (pasted.length > sectionLimit) {
    event.preventDefault();
    update(pasted);
  }
}
function ImportPaper({
  close,
  apply,
  fileFirst,
  modelState,
  imageModel,
  retryConnection,
}: {
  close: () => void;
  apply: (p: Paper, file?: File) => void;
  fileFirst: boolean;
  modelState: ModelState;
  imageModel: string;
  retryConnection: () => void;
}) {
  const ai = modelState === "ready";
  const [readProgress, setReadProgress] = useState("");
  const [text, setText] = useState(""),
    [introduction, setIntroduction] = useState(""),
    [title, setTitle] = useState(""),
    [url, setUrl] = useState(""),
    [byline, setByline] = useState(""),
    [reading, setReading] = useState(false),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const [voice, setVoice] = useState<PaperVoice>("author");
  const [useModel, setUseModel] = useState(true),
    [generating, setGenerating] = useState(false);
  const [showSource, setShowSource] = useState(!fileFirst);
  const tooLong =
    text.length > sectionLimit
      ? "摘要"
      : introduction.length > sectionLimit
        ? "引言"
        : "";
  const generateLock = useRef(false);
  const [building, setBuilding] = useState<Paper>();
  const [sourceCount, setSourceCount] = useState(0);
  const sourceVisuals = useRef<Paper["visuals"]>(undefined);
  const sourcePages = useRef<Paper["sourcePages"]>(undefined);
  const openFile = useRef<File | undefined>(undefined),
    sourceFigure = useRef<Paper["figure"]>(undefined),
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
    setReadProgress("正在打开文件");
    try {
      if (f.size > 40 * 1024 * 1024)
        throw Error("请选择 40 MB 以内的文件，或粘贴摘要。");
      const pdf = /\.pdf$/i.test(f.name);
      if (!pdf && !/\.(?:txt|md)$/i.test(f.name))
        throw Error("支持 PDF、TXT 和 Markdown 文件。");
      const d = pdf
        ? await (
            await import("./paper-pdf")
          ).readPdf(f, (status) => {
            if (ticket === inFlight.current) setReadProgress(status);
          })
        : { ...extractSections(await f.text()), figure: undefined };
      if (ticket !== inFlight.current) return;
      openFile.current = pdf ? f : undefined;
      sourceFigure.current = d.figure;
      sourceVisuals.current = "visuals" in d ? d.visuals : undefined;
      sourcePages.current = "pages" in d ? d.pages : undefined;
      setSourceCount(sourceVisuals.current?.length || 0);
      setText(d.abstract);
      setIntroduction(d.introduction);
      setTitle(d.title || f.name.replace(/\.[^.]+$/, ""));
      setUrl(d.source);
      setByline("byline" in d && typeof d.byline === "string" ? d.byline : "");
      const details = [
        "pages" in d
          ? "已读取 " +
            d.pages.length +
            " 页，摘要与引言取自前 " +
            d.pagesRead +
            " 页"
          : "已读取文本",
      ];
      if (sourceVisuals.current?.length)
        details.push("发现 " + sourceVisuals.current.length + " 项候选图表");
      if (pdf && !sourceVisuals.current?.length)
        details.push("未定位到图表，可在编辑器中补充");
      if (!d.namedAbstract)
        details.push(
          d.abstract ? "未识别摘要标题，请确认提取文字" : "未识别到摘要",
        );
      if (!d.introduction) details.push("未识别到引言，可补充或仅用摘要生成");
      else if (
        d.introductionContinues &&
        "hasLaterPages" in d &&
        d.hasLaterPages
      )
        details.push("引言截取至第 2 页末");
      setLabel([f.name, ...details].join(" · "));
      setShowSource(false);
    } catch (e) {
      if (ticket === inFlight.current)
        setError((e as Error).message || "无法读取这个文件。");
    } finally {
      if (ticket === inFlight.current) setReading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function generate(withModel = ai && useModel) {
    if (generateLock.current || modelState === "checking" || tooLong) return;
    generateLock.current = true;
    setGenerating(true);
    setError("");
    try {
      const extracted = label ? null : extractSections(text);
      const abstract = cleanManuscriptText(
        extracted?.namedAbstract ||
          (!title.trim() && extracted?.title) ||
          extracted?.hasIntroduction
          ? extracted.abstract
          : text,
      ).trim();
      const intro = cleanManuscriptText(
        introduction.trim() || extracted?.introduction || "",
      ).trim();
      const sections = { abstract, introduction: intro };
      const p = createPaper(
        [abstract, intro].filter(Boolean).join("\n\n"),
        title.trim() || extracted?.title || "",
        url.trim() || extracted?.source || "",
        byline,
        abstract || intro,
      );
      p.sections = sections;
      if (withModel) p.voice = voice;
      if (sourceFigure.current) p.figure = sourceFigure.current;
      p.visuals = sourceVisuals.current;
      p.sourcePages = sourcePages.current;
      // Save each completed stage in order. A tab reload can resume the same project.
      const final = await producePaper(
        p,
        {
          live: withModel,
          imageModel,
          source: openFile.current ? "pdf" : "text",
        },
        (snapshot) => {
          setBuilding(snapshot);
          void savePaperDraft(snapshot, false).catch((err: Error) =>
            setError(err.message),
          );
        },
      );
      apply(final, openFile.current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      generateLock.current = false;
      setGenerating(false);
    }
  }
  if(generating && building) return (<Dialog title="正在制作论文宣传材料" className="paper-build-dialog" dismissible={false} close={close}>
    <p className="pp-project-title">{building.title}</p><PaperProcess paper={building} running/>
    {error && <p role="alert" className="pr-error">{error}</p>}
  </Dialog>);
  return (
    <Dialog
      title="导入论文"
      close={() => {
        if (!generating) close();
      }}
    >
      <fieldset className="ds-fieldset paper-intake" disabled={generating}>
        <p className="pr-help">
          从 PDF
          找到方法图和结果表，再根据原文制作可编辑海报与四个平台的宣传稿。
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
          className={
            "pr-drop wx-attachment" +
            (drag ? " drag" : "") +
            (label && !reading ? " has-file" : "")
          }
          aria-label={label ? "替换论文文件" : "选择或拖入论文文件"}
          aria-describedby={label && !reading ? "wx-selected-file" : undefined}
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
          {reading ? (
            <>
              <LoaderCircle className="wx-spin" size={24} />
              <b role="status">{readProgress}</b>
            </>
          ) : label ? (
            <>
              <span className="wx-file-icon">
                <FileText size={23} />
              </span>
              <span className="wx-file-description" id="wx-selected-file">
                <span className="wx-received">
                  <Check size={14} /> 已读取论文
                </span>
                <strong>{title}</strong>
                <small>{label}</small>
              </span>
              <span className="wx-replace">替换</span>
            </>
          ) : (
            <>
              <span className="wx-drop-icon">
                <Upload size={24} />
              </span>
              <b>选择或拖入论文文件</b>
              <small>PDF、TXT、MD · 最大 40 MB</small>
            </>
          )}
        </button>
        <button
          type="button"
          aria-expanded={showSource}
          aria-controls="paper-import-source"
          className="paper-source-toggle"
          onClick={() => setShowSource(!showSource)}
        >
          {label ? "查看或修改提取内容" : "手动填写标题和摘要"}{" "}
          <span>{showSource ? "收起" : "展开"}</span>
        </button>
        <div
          className="paper-import-source"
          id="paper-import-source"
          hidden={!showSource}
        >
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
              maxLength={sectionLimit}
              onPaste={(e) => preserveLongPaste(e, setText)}
              placeholder={"论文标题\n在这里粘贴中文或英文摘要……"}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label>
            引言 <small>可选，可在此修正或补全</small>
            <textarea
              rows={3}
              value={introduction}
              maxLength={sectionLimit}
              onPaste={(e) => preserveLongPaste(e, setIntroduction)}
              placeholder="自动提取前两页内的引言，也可以手动粘贴"
              onChange={(e) => setIntroduction(e.target.value)}
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
        </div>
        {ai && (
          <label className="ds-model-option">
            <input
              type="checkbox"
              checked={useModel}
              onChange={(e) => setUseModel(e.target.checked)}
            />
            <span>
              {imageModel
                ? "用 AI 研读论文、设计海报并撰写宣传稿"
                : "用 AI 研读论文、排版并撰写宣传稿"}
              <small>
                PDF 和原图留在浏览器中。模型读取提取的正文、页码与图注。
              </small>
            </span>
          </label>
        )}
        {ai && useModel && (
          <>
            <VoicePicker value={voice} choose={setVoice} disabled={generating} />
            <WorkflowModels context="paper" disabled={generating} />
          </>
        )}
        {STATIC_DEMO && <LiveStudioLink route="#papers/import" />}
        {modelState === "unreachable" && (
          <div className="pr-verification" role="status">
            暂时连不上模型服务。{" "}
            <button
              type="button"
              className="pr-reset"
              onClick={retryConnection}
            >
              重新连接
            </button>
          </div>
        )}
        {!generating && sourceCount > 0 && (
          <p className="pr-help">生成后可在画布中替换图表、调整位置和文字。</p>
        )}
        {tooLong && (
          <p role="alert" className="pr-error">
            {tooLong}超过 45,000 字符，已保留完整内容。请在输入框中精简后生成。
            {!showSource && (
              <button type="button" onClick={() => setShowSource(true)}>
                展开修改
              </button>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="pr-error">
            {error}
          </p>
        )}
        <button
          className="pr-action"
          disabled={
            modelState === "checking" ||
            !!tooLong ||
            reading ||
            generating ||
            !(text.trim() || introduction.trim())
          }
          onClick={() => generate()}
        >
          {modelState === "checking"
            ? "正在检查模型服务…"
            : generating
              ? "正在生成宣传材料…"
              : ai && useModel
                ? "生成四套宣传材料"
                : "生成四套本地摘录稿"}{" "}
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
  apply: (text: string, generatedVoice?: PaperVoice) => void;
  selectText: boolean;
}) {
  const [value, setValue] = useState(initial),
    [state, setState] = useState(""),
    [working, setWorking] = useState(false);
  const [voice, setVoice] = useState<PaperVoice>(
    channelVoice(paper, channel) || paper.voice || "author",
  );
  const [generatedVoice, setGeneratedVoice] = useState<PaperVoice>();
  const [angle, setAngle] = useState("");
  const field = useRef<HTMLTextAreaElement>(null),
    key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (selectText) field.current?.select();
  }, []);
  const rewriteModel = useWorkflowChoices().rewrite;
  useEffect(() => { key.current = crypto.randomUUID(); }, [rewriteModel]);
  async function adapt() {
    setWorking(true);
    setState("");
    try {
      const next = await adaptChannel(
        paper,
        channel,
        key.current,
        angle,
        voice,
        value,
      );
      setValue(next);
      key.current = crypto.randomUUID();
      setGeneratedVoice(voice);
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
      {ai && <WorkflowModels context="rewrite" disabled={working} />}
      {ai && (
        <VoicePicker
          value={voice}
          disabled={working}
          choose={(next) => {
            setVoice(next);
            key.current = crypto.randomUUID();
          }}
        />
      )}
      {ai && (
        <div className="pr-ai">
          {channel === "red" && (
            <label className="pr-angle">
              写作切入点
              <select
                value={angle}
                disabled={working}
                onChange={(e) => {
                  setAngle(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              >
                <option value="">根据论文选择</option>
                <option>从实际问题切入</option>
                <option>讲清方法的关键动作</option>
                <option>从有依据的对照结果切入</option>
              </select>
            </label>
          )}
          <button disabled={working} onClick={adapt}>
            <Sparkles size={16} />
            {working
              ? "正在改写…"
              : "按" + platforms[channel].name + "风格改写"}
          </button>
          <small>
            {paper.sections
              ? "使用已保存的摘要和引言。"
              : "使用标题和选中的原句。"}
          </small>
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
          onChange={(e) => {
            setValue(e.target.value);
            key.current = crypto.randomUUID();
          }}
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
        onClick={() => apply(value.trim(), generatedVoice)}
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
    [title, setTitle] = useState(paper.title),
    [byline, setByline] = useState(paper.byline || ""),
    [source, setSource] = useState(paper.source),
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
  const sourceValid = paperSchema.shape.source.safeParse(source.trim()).success;
  const canSave =
    !working &&
    title.trim() &&
    headline.trim() &&
    sourceValid &&
    evidence.every((e) => e.line.trim());
  const evidenceChanged =
    JSON.stringify(evidence) !== JSON.stringify(paper.evidence);
  function save(replaceDrafts = false) {
    const next = updateBibliography(paper, {
      title: title.trim(),
      byline: byline.trim(),
      source: source.trim(),
    });
    next.headline = headline.trim();
    if (evidenceChanged) {
      next.evidence = evidence;
      // A changed quote makes its previous per-platform indexes unreliable.
      if (evidence.some((e, i) => e.quote !== paper.evidence[i].quote))
        next.evidenceIds = undefined;
      if (replaceDrafts) {
        next.edits = {};
        next.model = undefined;
        next.evidenceIds = undefined;
      }
    }
    apply(next);
  }
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
    <Dialog title="核对原句与宣传文案" close={close}>
      <p className="pr-help">
        {paper.evidenceIds?.[channel]?.length
          ? platforms[channel].name +
            " 初稿引用了第 " +
            paper.evidenceIds[channel]!.join("、") +
            " 句。请对照原句核对数字、比较方向和结论范围。"
          : "可对照下方原句核对发布文案。修改宣传文案会更新四个平台的本地摘录稿。"}
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
      <details className="pr-verification">
        <summary>校对论文出处</summary>
        <label>
          论文原题
          <input
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          作者与出版信息
          <input
            value={byline}
            maxLength={240}
            onChange={(e) => setByline(e.target.value)}
          />
        </label>
        <label>
          原文链接
          <input
            value={source}
            type="url"
            maxLength={1200}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        {!sourceValid && (
          <p className="pr-error">
            请填写有效的 http 或 https 原文链接，或留空。
          </p>
        )}
      </details>
      {paper.sections && (
        <details className="pr-verification">
          <summary>查看生成时使用的摘要与引言</summary>
          {paper.sections.abstract && <p>{paper.sections.abstract}</p>}
          {paper.sections.introduction && <p>{paper.sections.introduction}</p>}
        </details>
      )}
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
            宣传文案 {i + 1}
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
          <small>仅将标题及以上原句发送给当前使用的模型。</small>
        </div>
      )}
      {state && (
        <p role="status" className="pr-help">
          {state}
        </p>
      )}
      <button className="pr-action" disabled={!canSave} onClick={() => save()}>
        {evidenceChanged && Object.keys(paper.edits).length
          ? "保存原句并保留发布稿"
          : evidenceChanged
            ? "应用到四个平台"
            : "完成核对"}{" "}
        <Check size={16} />
      </button>
      {evidenceChanged && Object.keys(paper.edits).length > 0 && (
        <button
          className="pr-reset"
          disabled={!canSave}
          onClick={() => save(true)}
        >
          用更新后的摘录替换四个平台的文案
        </button>
      )}
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
function starterPaper(): Paper {
  return {
    ...examplePaper(),
    voice: "author",
    headline: noteParts(exampleCopy.red).title,
    edits: { ...exampleCopy },
  };
}
export default function PaperStudio() {
  type Start =
    ReturnType<typeof resumePaper> | { example: true; edit: boolean };
  const [resume, setResume] = useState<Start>(() => {
    if (location.hash === clashbenchPath) return { example: true, edit: true };
    try {
      if (!localStorage.getItem(paperKey) && location.hash !== "#papers/import")
        return { example: true, edit: false };
    } catch {
      /* Storage can be unavailable in private browser windows. */
    }
    return resumePaper(starterPaper);
  });
  const [initialEditor, setInitialEditor] = useState(false);
  useEffect(() => {
    function route() {
      if (location.hash === clashbenchPath) {
        setFailed(false);
        setResume({ example: true, edit: true });
      }
    }
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  const [attempt, retry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if ("paper" in resume) return;
    let active = true;
    const isCase = "example" in resume;
    (isCase ? openClashbenchCase(resume.edit) : restoreLibraryDraft(resume))
      .then((paper) => {
        if (!active) return;
        setInitialEditor(isCase && resume.edit);
        if (isCase && resume.edit)
          history.replaceState(history.state, "", "#papers/channels/red");
        setResume({
          paper,
          pendingWrite: isCase ? resume.edit : !!resume.pendingFields,
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, resume]);
  if (!("paper" in resume))
    return (
      <main className="pr-library" aria-busy={!failed}>
        <p role="status">
          {failed
            ? "example" in resume
              ? "暂时无法打开 ClashBench 案例。"
              : "暂时无法恢复上次打开的论文。"
            : "example" in resume
              ? "正在打开 ClashBench 论文案例…"
              : "正在恢复论文草稿…"}
        </p>
        {failed && (
          <>
            <button
              onClick={() => {
                setFailed(false);
                retry(attempt + 1);
              }}
            >
              重新读取
            </button>
            <button onClick={() => setResume({ paper: starterPaper() })}>
              打开示例论文
            </button>
          </>
        )}
      </main>
    );
  return (
    <PaperWorkspace
      key={resume.paper.id}
      initialPaper={resume.paper}
      initialEditor={initialEditor}
      pendingWrite={!!resume.pendingWrite}
    />
  );
}
function PaperWorkspace({
  initialPaper,
  initialEditor,
  pendingWrite,
}: {
  initialPaper: Paper;
  initialEditor: boolean;
  pendingWrite: boolean;
}) {
  const [paper, setPaper] = useState(initialPaper),
    [channel, setChannel] = useState<Channel>("red"),
    [modal, setModal] = useState<
      | "file"
      | "paste"
      | "evidence"
      | "copy"
      | "rewrite"
      | "preview"
      | "figure"
      | "library"
      | "layout"
      | null
    >(initialEditor ? "layout" : null);
  const [edit, setEdit] = useState(""),
    [manualSelect, setManualSelect] = useState(false),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [modelState, setModelState] = useState<ModelState>(
      STATIC_DEMO ? "offline" : "checking",
    ),
    [imageModel, setImageModel] = useState(""),
    [statusAttempt, setStatusAttempt] = useState(0);
  const ai = modelState === "ready";
  const originalFile = useRef<File | undefined>(undefined);
  const result = useRef<HTMLElement>(null),
    lock = useRef(false);
  const copy = useMemo(() => channelCopy(paper, channel), [paper, channel]);
  const reviewTerms = paper.model ? wordingToReview(paper, channel) : [];
  const channelInfo = platforms[channel];
  const activeVoice = channelVoice(paper, channel);
  useEffect(() => {
    function openRoute() {
      const hash = location.hash;
      if (hash === "#papers/import") {
        setModal("file");
        history.replaceState(history.state, "", "#papers");
      } else if (
        hash === "#papers/story" ||
        hash.startsWith("#papers/channels")
      ) {
        if (hash === "#papers/story")
          history.replaceState(history.state, "", "#papers/channels");
        const platform = hash.split("/")[2];
        if (channels.includes(platform as Channel))
          setChannel(platform as Channel);
        result.current?.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    }
    document.title = "论文宣传 · PosterLab";
    openRoute();
    window.addEventListener("hashchange", openRoute);
    return () => window.removeEventListener("hashchange", openRoute);
  }, []);
  useEffect(() => {
    if (STATIC_DEMO) return;
    let live = true;
    studioFetch("/status", { signal: AbortSignal.timeout(8000) })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const d = await r.json();
        if (typeof d.ai !== "boolean") throw Error();
        if (live) {
          setModelState(d.ai ? "ready" : "offline");
          setImageModel(
            d.ai && typeof d.artwork_model === "string" ? d.artwork_model : "",
          );
        }
      })
      .catch(() => {
        if (live) setModelState("unreachable");
      });
    return () => {
      live = false;
    };
  }, [statusAttempt]);
  useEffect(() => {
    let active = true;
    savePaperDraft(paper, paper === initialPaper && !pendingWrite).catch(
      (error) => {
        if (active) setMessage((error as Error).message);
      },
    );
    return () => {
      active = false;
    };
  }, [paper, initialPaper, pendingWrite]);
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(""), 5500);
      return () => clearTimeout(timer);
    }
  }, [message]);
  const name =
    paper.headline.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 50) || "论文";
  const activePaper = useRef(paper);
  activePaper.current = paper;
  const [retryProgress, setRetryProgress] = useState<Paper>();
  async function resumeProcess() {
    if (!ai || lock.current || !paper.process) return;
    lock.current = true;
    setBusy("pipeline");
    setRetryProgress(paper);
    try {
      const done = await producePaper(
        paper,
        { live: true, imageModel, source: paper.process.source },
        (snapshot) => {
          if (activePaper.current.id === paper.id) {
            const checkpoint=preservePaperEdits(paper,snapshot,activePaper.current);
            setRetryProgress(checkpoint);
            void savePaperDraft(checkpoint, false).catch((err: Error) =>
              setMessage(err.message),
            );
          }
        },
      );
      if (activePaper.current.id === paper.id) setPaper(current=>preservePaperEdits(paper,done,current));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "本次未能完成，请重试。",
      );
    } finally {
      setRetryProgress(undefined);
      lock.current = false;
      setBusy("");
    }
  }
  async function retryModel() {
    if (lock.current || !paper.sections) return;
    lock.current = true;
    setBusy("model");
    try {
      const kit = await writePaper(paper, crypto.randomUUID());
      const current = activePaper.current;
      if (current.id !== paper.id || current.sections !== paper.sections)
        return;
      // A retry may fill untouched local channels. Keep any work the author
      // saved while waiting, including manual text, artwork and cover title.
      const needed = current.localChannels || [];
      const accepted = needed.filter((c) => !!kit.edits[c]);
      if (!accepted.length) {
        setMessage("模型未补齐缺少的平台，当前草稿已保留。");
        return;
      }
      const merged = applyPaperDrafts(current, kit, accepted);
      const localChannels = merged.localChannels || [];
      setPaper({
        ...merged,
        coverLine: kit.coverLine || current.coverLine,
        coverTitleEn: kit.coverTitleEn || current.coverTitleEn,
        coverLineEn: kit.coverLineEn || current.coverLineEn,
        modelNotice: undefined,
        headline:
          current.headline === current.title ? kit.headline : current.headline,
      });
      setMessage(
        localChannels.length
          ? "已补充可用的模型文案，其余平台保留本地摘录。"
          : "四个平台的文案已就绪",
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function renderArtwork() {
    if (lock.current || !imageModel) return;
    lock.current = true;
    setBusy("artwork");
    const { id } = paper;
    try {
      const art = await generatePaperArtwork(
        paper,
        paper.artworkRetryKey || crypto.randomUUID(),
      );
      setPaper((current) =>
        current.id === id ? { ...current, ...art } : current,
      );
      if (activePaper.current.id === id)
        setMessage(
          art.artwork
            ? "四个平台的配图已更新"
            : art.artworkNotice || "主视觉暂时无法生成",
        );
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function save(which: "all" | "channel" | "image" | "drawio") {
    if (lock.current) return;
    lock.current = true;
    setBusy(which);
    try {
      const blob =
        which === "drawio"
          ? await paperDrawio(paper, channel)
          : which === "image"
            ? await paperPng(paper, channel)
            : await paperPack(paper, which === "channel" ? channel : undefined);
      const suffix =
        which === "all"
          ? "论文宣传套装.zip"
          : channelInfo.name +
            (which === "channel"
              ? "发布包.zip"
              : which === "drawio"
                ? ".drawio"
                : ".png");
      download(blob, name + "-" + suffix);
      setMessage("文件已下载");
    } catch (e) {
      setMessage((e as Error).message || "导出失败，请重试。");
    } finally {
      setBusy("");
      lock.current = false;
    }
  }
  async function clipboard(text: string, rich = false) {
    try {
      if (
        rich &&
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard?.write
      ) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/plain": new Blob([text], { type: "text/plain" }),
              "text/html": new Blob([articleFragment(text)], {
                type: "text/html",
              }),
            }),
          ]);
          setMessage("已复制标题和段落排版，可粘贴到公众号编辑器");
          return true;
        } catch {
          // Some browsers only allow the text clipboard, even on localhost.
        }
      }
      await navigator.clipboard.writeText(text);
      setMessage(rich ? "已复制纯文本，排版稿可在发布包中获取" : "文案已复制");
      return true;
    } catch {
      setManualSelect(true);
      setEdit(text);
      setModal("copy");
      setMessage("已选中文案，可手动复制");
      return false;
    }
  }
  return (
    <div id="publicity-studio" className="campaign pr-page ds-workroom">
      <CampaignNav active="papers" onPapers={() => setModal("library")} />
      <main className="cp-shell pr-shell">
        <section
          className={
            "pr-hero " +
            (paper.sample && !paper.figure ? "pr-space" : "pr-generic")
          }
        >
          <div className="pr-hero-copy">
            <h1>论文宣传</h1>
            {ai && <WorkflowModels context="paper" disabled={!!busy} />}
            <p>导入一篇论文，为小红书、X、朋友圈和公众号准备发布稿。</p>
            <div className="pr-actions">
              <button className="pr-import" onClick={() => setModal("file")}>
                <FileUp size={17} />
                导入论文 PDF
              </button>
              <button className="pr-paste" onClick={() => setModal("paste")}>
                <Clipboard size={16} />
                粘贴摘要
              </button>
              <a className="pr-case-link" href={clashbenchPath}>
                编辑 ClashBench 示例 <ArrowUpRight size={15} />
              </a>
            </div>
          </div>
          <aside className="wx-paper-source" aria-label="当前论文">
            <div className="wx-source-image">
              {paper.figure ? (
                <img
                  className="pr-userfig"
                  src={paper.figure.data}
                  alt={paper.figure.credit}
                />
              ) : paper.sample ? (
                <img
                  src={import.meta.env.BASE_URL + "papers/m87.jpg"}
                  alt="事件视界望远镜观测到的 M87 黑洞"
                />
              ) : (
                <FileText size={34} />
              )}
            </div>
            <div>
              <span>
                {paper.sample
                  ? activeVoice === "author"
                    ? "示例论文 · 作者口吻示范"
                    : "示例论文"
                  : "当前论文"}
              </span>
              <strong>{paper.title}</strong>
              {paper.sample && !paper.figure ? (
                <a
                  href="https://www.eso.org/public/images/eso1907a/"
                  target="_blank"
                  rel="noreferrer"
                >
                  EHT Collaboration · CC BY 4.0 <ArrowUpRight size={12} />
                </a>
              ) : paper.figure ? (
                <small>{paper.figure.credit}</small>
              ) : null}
            </div>
          </aside>
        </section>
        <section className="pr-results" ref={result} aria-label="平台发布台">
          <div className="pr-resultshead">
            <div>
              <div className="pr-eyebrow">
                <span />
                {paper.sample
                  ? "示例论文 · 已生成"
                  : paper.localChannels?.includes(channel) ||
                      !paper.edits[channel]
                    ? "本地摘录"
                    : [
                        activeVoice ? voiceNames[activeVoice] : "",
                        paper.model
                          ? "模型初稿 · " + paper.model
                          : activeVoice
                            ? "已改写"
                            : "已保存文案",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
              </div>
              <h2>{paper.headline}</h2>
              {paper.publicationCheck?.channels.includes(channel) && (
                <small className="pr-copy-checked">
                  {paper.publicationCheck.revised.includes(channel)
                    ? "已按平台发布口吻复核并改写"
                    : "已复核发布口吻，当前保留初稿"}
                </small>
              )}
            </div>
            <div className="pr-result-actions">
              <button
                className="pr-rewrite-open"
                disabled={!!busy}
                onClick={() => setModal("layout")}
              >
                编辑海报图层
              </button>
              {ai && (
                <button
                  className="pr-rewrite-open"
                  disabled={!!busy}
                  onClick={() => setModal("rewrite")}
                >
                  <Sparkles size={16} />
                  重写四平台宣传稿
                </button>
              )}
              <button
                className="pr-action"
                disabled={!!busy}
                onClick={() => save("all")}
              >
                <Download size={16} />
                {busy === "all" ? "正在打包…" : "下载整套 ZIP"}
              </button>
            </div>
          </div>
          {(retryProgress || paper.process) && (
            <PaperProcess
              paper={retryProgress || paper}
              running={!!retryProgress}
              openCanvas={!busy && !retryProgress ? (platform) => {setChannel(platform); setModal("layout");} : undefined}
              retry={ai && !busy ? resumeProcess : undefined}
            />
          )}
          {paper.sections &&
            !paper.process?.live &&
            !!paper.localChannels?.length && (
              <div className="pr-recovery">
                <div>
                  <b>
                    {paper.modelNotice
                      ? "模型未返回可用文案，已保存本地摘录稿"
                      : "部分平台使用本地摘录"}
                  </b>
                  <p>
                    {paper.modelNotice ||
                      paper.localChannels
                        .map((c) => platforms[c].name)
                        .join("、")}
                    　可以直接编辑或导出。
                  </p>
                </div>
                {ai && (
                  <button disabled={!!busy} onClick={retryModel}>
                    {busy === "model" ? "正在撰写…" : "用原摘要和引言重新撰写"}
                  </button>
                )}
              </div>
            )}
          <PublicationDesk
            paper={paper}
            channel={channel}
            copy={copy}
            reviewTerms={reviewTerms}
            busy={busy}
            choose={(c) => {
              setChannel(c);
              history.replaceState(history.state, "", "#papers/channels/" + c);
            }}
            edit={() => {
              setManualSelect(false);
              setEdit(copy);
              setModal("copy");
            }}
            evidence={() => setModal("evidence")}
            figure={() => setModal("figure")}
            makeArtwork={imageModel ? renderArtwork : undefined}
            zoom={() => setModal("preview")}
            exportFile={save}
            clipboard={clipboard}
          />
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
        <WorkroomCases kind="paper" />
      </main>
      {(modal === "file" || modal === "paste") && (
        <ImportPaper
          modelState={modelState}
          imageModel={imageModel}
          retryConnection={() => {
            setModelState("checking");
            setStatusAttempt((attempt) => attempt + 1);
          }}
          fileFirst={modal === "file"}
          close={() => setModal(null)}
          apply={(p, f) => {
            originalFile.current = f;
            setPaper(p);
            setModal(null);
            setMessage(
              p.modelNotice
                ? "模型暂时未返回可用文案，摘要、引言和本地摘录稿已保存。"
                : p.localChannels?.length
                  ? "已保留模型返回的文案，其余平台已标记为本地摘录。"
                  : p.model
                    ? "四个平台的宣传材料已生成"
                    : "四个平台的本地摘录稿已生成",
            );
            requestAnimationFrame(() =>
              result.current?.scrollIntoView({ block: "start" }),
            );
          }}
        />
      )}
      {modal === "layout" && (
        <Dialog
          title="编辑海报图层"
          className="paper-layout-dialog"
          close={() => setModal(null)}
        >
          <PaperLayoutEditor
            paper={paper}
            channel={channel}
            onChange={setPaper}
          />
        </Dialog>
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
          apply={(text, generatedVoice) => {
            const evidenceIds = { ...paper.evidenceIds };
            delete evidenceIds[channel];
            setPaper({
              ...paper,
              evidenceIds,
              ...(generatedVoice && {
                channelVoices: {
                  ...paper.channelVoices,
                  [channel]: generatedVoice,
                },
              }),
              localChannels: paper.localChannels?.filter((c) => c !== channel),
              edits: { ...paper.edits, [channel]: text },
            });
            setModal(null);
          }}
        />
      )}
      {modal === "rewrite" && (
        <RewritePaper
          paper={paper}
          close={() => setModal(null)}
          apply={(kit, selected) => {
            setPaper(applyPaperDrafts(paper, kit, selected));
            setModal(null);
            setMessage(
              "已更新" +
                selected.map((c) => platforms[c].name).join("、") +
                "的宣传稿",
            );
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
                setPaper(changePaperFigure(paper));
                setModal(null);
              }}
            >
              移除自选插图
            </button>
          )}
          <PaperFigure
            file={originalFile.current}
            apply={(figure) => {
              setPaper(changePaperFigure(paper,figure));
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
          <button
            className="pr-reset"
            disabled={!!busy}
            onClick={() => save("drawio")}
          >
            下载可编辑 Draw.io
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
