import WorkflowModels, { useWorkflowChoices } from "./WorkflowModels";
import { modelField } from "./workflow-models";
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
  FolderOutput,
  LayoutTemplate,
  ImagePlus,
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
  noticeFromBrief,
  parseNotice,
  readCampaign,
  changeNotice,
  type Draft,
} from "./campaign-model";
import CampaignReleasePlan from "./CampaignPlan";
import CampaignExport from "./CampaignExport";
import { CampaignSteps } from "./CampaignSteps";
import {
  persistTrace,
  restoreTrace,
  type CampaignStep,
} from "./campaign-trace";
import { releasePlan } from "./campaign-plan";
import { campaignTag } from "./campaign-design";
import { makeCover } from "./cover";
import { editions, type Edition } from "./editions";
import {
  formats,
  briefSchema,
  checkpoint,
  labels,
  type Project,
  type Brief,
  type CampaignPlan,
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
import { writeCampaign } from "./outreach";
import { STATIC_DEMO, studioFetch } from "./studio-api";
import {
  applyCampaignArtwork,
  applyCampaignLibraryBackground,
  clearArtworkRequest,
  prepareArtworkRequest,
  type ArtworkRequest,
} from "./campaign-artwork";
import LiveStudioLink from "./LiveStudioLink";
import { CampaignNav } from "./CampaignNav";
import { reviewCampaign, type CampaignReview } from "./campaign-review";
import "./publicity-workroom.css";
import WorkroomCases from "./WorkroomCases";
import NoticeExamples from "./NoticeExamples";
import BackgroundLibrary from "./BackgroundLibrary";
import type { LibraryBackground } from "./background-library";

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
  locked = false,
}: {
  name: string;
  close: () => void;
  children: ReactNode;
  large?: boolean;
  locked?: boolean;
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
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) close();
      }}
      className={"cp-dialog" + (large ? " cp-large" : "")}
      aria-label={name}
      onClick={(e) => {
        if (!locked && e.target === ref.current) close();
      }}
    >
      <div>
        <header>
          <h2>{name}</h2>
          <button aria-label="关闭" onClick={close} disabled={locked}>
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
  plan?: CampaignPlan,
  workingId?: string,
) {
  const p = makeCover(edition, brief.title);
  if (workingId) p.id = workingId;
  p.current.campaignPlan = plan;
  p.current.layout = "campaign";
  p.current.campaignVersion = 2;
  p.current.displayTitle = concept?.tag || campaignTag(brief.title);
  if (concept)
    p.current.campaignCopy = {
      invitation: concept.invitation,
      model: concept.model,
      reason: concept.reason,
      art_direction: concept.art_direction,
    };
  p.current.brief = { ...brief };
  return p;
}
export default function CampaignHome() {
  const [planView, setPlanView] = useState(location.hash === "#campaign/plan");
  const [exportFormat, setExportFormat] = useState<Format | "all">("all");
  const [proofFormat, setProofFormat] = useState<Format | "all">("all");

  const [draft, setDraft] = useState<Draft>(readCampaign),
    [fontRev, setFontRev] = useState(0);
  const [modal, setModal] = useState<
      "facts" | "schedule" | "preview" | "qr" | "export" | null
    >(null),
    [editing, edit] = useState<Brief>(draft.brief),
    [selected, select] = useState<Format>("portrait");
  const [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [copied, setCopied] = useState(false),
    [copyTab, setCopyTab] = useState<"invite" | "update">("invite");
  const [session, setSession] = useState(() =>
    restoreTrace(
      new URLSearchParams(location.search).get("campaignProject") ||
        draft.projectId ||
        draft.workingId,
    ),
  );
  const { title: traceTitle, steps: trace } = session;
  useEffect(() => {
    persistTrace(session);
  }, [session]);
  function selectProjectTrace(id: string, title: string) {
    setSession((previous) =>
      previous.id === id
        ? { ...previous, title }
        : { ...restoreTrace(id), title },
    );
  }
  function recordStep(
    id: CampaignStep["id"],
    state: CampaignStep["state"],
    source: string,
    detail: string,
  ) {
    setSession((previous) => {
      const next = { id, state, source, detail };
      const steps = previous.steps.some((item) => item.id === id)
        ? previous.steps.map((item) => (item.id === id ? next : item))
        : [...previous.steps, next];
      return { ...previous, steps };
    });
  }
  async function withStep<T>(
    id: CampaignStep["id"],
    source: string,
    work: () => Promise<T>,
    describe: (result: T) => string,
  ) {
    recordStep(id, "working", source, "");
    try {
      const value = await work();
      recordStep(id, "done", source, describe(value));
      return value;
    } catch (error) {
      recordStep(
        id,
        "failed",
        source,
        (error as Error).message || "当前步骤未完成。",
      );
      throw error;
    }
  }
  const chosenModels = useWorkflowChoices();
  function writeInvitation(brief: Brief) {
    return withStep(
      "copy",
      chosenModels.campaign || model,
      () => writeCampaign(brief, crypto.randomUUID(), chosenModels.campaign),
      (plan) =>
        [plan.invitation, plan.art_direction || plan.reason]
          .filter(Boolean)
          .join("\n\n"),
    );
  }
  const textarea = useRef<HTMLTextAreaElement>(null),
    artworkRequest = useRef<ArtworkRequest | null>(null),
    busyRef = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [checkingModel, setCheckingModel] = useState(!STATIC_DEMO),
    [model, setModel] = useState(""),
    [visionModel, setVisionModel] = useState(""),
    [artworkModel, setArtworkModel] = useState(""),
    [useModel, setUseModel] = useState(true);
  useEffect(() => {
    let current = true;
    if (!STATIC_DEMO) {
      studioFetch("/status", { signal: AbortSignal.timeout(8000) })
        .then(async (response) => {
          if (!response.ok) return;
          const info = await response.json();
          if (!current || !info.ai) return;
          setModel(info.campaign_model || info.model || "");
          setArtworkModel(info.artwork_model || "");
          setVisionModel(info.vision_model || "");
        })
        .catch(() => {})
        .finally(() => {
          if (current) setCheckingModel(false);
        });
    }
    return () => {
      current = false;
    };
  }, []);
  const dirty = draft.raw.trim() !== draft.applied.trim();
  const [linked, setLinked] = useState<Project>();
  const [requestedProject, setRequestedProject] = useState(() =>
    new URLSearchParams(location.search).get("campaignProject"),
  );
  const activeId = requestedProject || draft.projectId;
  const projectPending = !!activeId && activeId !== linked?.id;
  useEffect(() => {
    const id = activeId;
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
          const same = d.projectId === id;
          const originalNotice =
            same && JSON.stringify(d.brief) === JSON.stringify(brief);
          const applied = originalNotice ? d.applied : noticeFromBrief(brief);
          const copy = p.current.campaignCopy;
          return {
            ...d,
            workingId: id!,
            projectId: id!,
            brief,
            edition,
            plan: p.current.campaignPlan,
            concept: copy
              ? {
                  ...copy,
                  tag: p.current.displayTitle ?? campaignTag(brief.title),
                  edition: same ? d.concept?.edition : edition,
                }
              : undefined,
            applied,
            raw: same && d.raw !== d.applied ? d.raw : applied,
            previous: same
              ? hasChanges(d.brief, brief)
                ? schedule(d.brief)
                : d.previous
              : undefined,
          };
        });
      } catch {
        if (current) {
          setDraft((d) =>
            d.projectId === id ? { ...d, projectId: undefined } : d,
          );
          setFeedback(
            requestedProject
              ? "未找到该项目，已打开本地活动。"
              : "已从本地通知恢复宣传套装。",
          );
        }
      } finally {
        if (current && requestedProject) {
          const url = new URL(location.href);
          url.searchParams.delete("campaignProject");
          history.replaceState(history.state, "", url);
          setRequestedProject(null);
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
  }, [activeId, requestedProject]);
  const project = useMemo(() => {
    if (linked && draft.projectId === linked.id) return linked;
    return campaignProject(
      draft.edition,
      draft.brief,
      draft.concept,
      draft.plan,
      draft.workingId,
    );
  }, [
    draft.edition,
    draft.brief,
    draft.concept,
    draft.projectId,
    draft.plan,
    draft.workingId,
    linked,
  ]);
  const layouts = useMemo(
    () => ({
      portrait: renderPoster(project, "portrait"),
      square: renderPoster(project, "square"),
      landscape: renderPoster(project, "landscape"),
    }),
    [project, fontRev],
  );
  const libraryCredit = project.current.heroId
    ? project.assets[project.current.heroId]?.library
    : undefined;
  const [reviews, setReviews] = useState<Record<string, CampaignReview>>({});
  const reviewKey = `${project.id}/${project.updated}/${selected}/${chosenModels.campaignReview || visionModel}`;
  const currentReview = reviews[reviewKey];
  function inspectProof() {
    run("review", async () => {
      selectProjectTrace(project.id, project.current.brief.title);
      const result = await withStep(
        "review",
        chosenModels.campaignReview || visionModel,
        () => reviewCampaign(project, selected, chosenModels.campaignReview),
        (reply) => formats[selected].name + " · " + reply.summary,
      );
      setReviews((previous) => ({ ...previous, [reviewKey]: result }));
    });
  }
  const updateCopy = draft.previous
    ? changeNotice(draft.previous, draft.brief)
    : "";
  const copy =
    copyTab === "update" && updateCopy
      ? updateCopy
      : releasePlan(project)[0].copy;
  const allErrors = Object.values(layouts).flatMap((l) =>
    l.issues.filter((i) => i.level === "error"),
  );
  useEffect(() => {
    const title = document.title;
    const navigate = () => {
      const isPlan = location.hash === "#campaign/plan";
      setPlanView(isPlan);
      document.title = isPlan
        ? "PosterLab · 活动发布计划"
        : "PosterLab · 活动宣传制作台";
      window.scrollTo(0, 0);
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => {
      window.removeEventListener("hashchange", navigate);
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
    if (!edition && checkingModel) return;
    run("generate", async () => {
      setSession({ id: "", title: "", steps: [] });
      let brief: Brief;
      let workingId: string;
      try {
        brief = parseNotice(text);
        workingId =
          !edition && brief.title === draft.brief.title
            ? draft.workingId
            : crypto.randomUUID();
        setSession({ id: workingId, title: brief.title, steps: [] });
        recordStep(
          "notice",
          "done",
          "本机提取",
          [brief.title, brief.date, brief.time, brief.venue]
            .filter(Boolean)
            .join(" · "),
        );
      } catch (error) {
        recordStep(
          "notice",
          "failed",
          "本机提取",
          (error as Error).message || "未能提取活动信息。",
        );
        textarea.current?.focus();
        throw error;
      }
      const same =
        !!linked &&
        draft.projectId === linked.id &&
        brief.title === draft.brief.title;
      let aiPlan: Draft["concept"];
      let copyError = "";
      if (!edition && useModel && model) {
        try {
          aiPlan = await writeInvitation(brief);
        } catch (e) {
          if (!artworkModel) throw e;
          copyError = (e as Error).message || "文案模型暂时不可用。";
        }
      }
      const continueDraft = !edition && brief.title === draft.brief.title;
      const next: Draft = {
        workingId,
        plan: continueDraft ? project.current.campaignPlan : undefined,
        raw: text,
        applied: text,
        brief,
        concept:
          aiPlan ||
          (same && copyError && draft.concept
            ? { ...draft.concept, art_direction: "" }
            : undefined),
        edition:
          edition ??
          aiPlan?.edition ??
          (same ? draft.edition : chooseEdition(text)),
      };
      const layoutDetail =
        editions[next.edition].name +
        " · " +
        channels.map((item) => item.name).join("、");
      let message = "三张宣传图和邀请文案已生成";
      if (!edition) {
        let generated: Project;
        if (same) {
          next.projectId = linked.id;
          next.previous = hasChanges(draft.brief, brief)
            ? schedule(draft.brief)
            : draft.previous;
          generated = await storeChanges(next, !!artworkModel && useModel);
        } else {
          generated = campaignProject(
            next.edition,
            brief,
            next.concept,
            next.plan,
            next.workingId,
          );
          try {
            generated = await saveCampaignProject(generated);
          } catch {
            message = "成品已生成，作品库暂不可用，请下载备份。";
          }
          next.projectId = generated.id;
          setLinked(generated);
          setDraft(next);
        }
        recordStep("layout", "done", "本机排版", layoutDetail);
        if (useModel && artworkModel && !(same && libraryCredit)) {
          setBusy("generate-art");
          try {
            await paintArtwork(generated, !copyError);
          } catch (e) {
            const ready = copyError
              ? "活动通知已保留，邀请文案沿用现有版本。"
              : "排版和邀请文案已就绪。";
            throw Error(
              ready +
                ((e as Error).message || "图片生成失败。") +
                " 可点击「生成主视觉」单独重试。",
            );
          }
        }
        if (copyError) {
          throw Error(
            "三张海报已就绪。请在「发布文案」核对现有版本或单独生成邀请文案。" +
              copyError,
          );
        }
        preview("portrait");
      } else {
        setDraft(next);
        recordStep("layout", "done", "本机排版", layoutDetail);
      }
      setCopied(false);
      setCopyTab("invite");
      say(message);
    });
  }
  function generateArtwork() {
    if (!artworkModel || dirty || projectPending) return;
    run("artwork", async () => {
      selectProjectTrace(project.id, project.current.brief.title);
      await paintArtwork(project);
      say("主视觉已应用到三种画幅");
    });
  }
  async function changeLibraryBackground(choice?: { row: LibraryBackground; file: File }) {
    if (busyRef.current || projectPending) throw Error("正在准备项目，请稍后再试。");
    busyRef.current = true;
    setBusy("library");
    try {
      const brief = dirty && choice ? parseNotice(draft.raw) : draft.brief;
      const same = brief.title === draft.brief.title;
      const nextDraft: Draft = same
        ? { ...draft, brief }
        : { brief, raw: draft.raw, applied: draft.raw, edition: chooseEdition(draft.raw), workingId: crypto.randomUUID() };
      if (dirty && choice) nextDraft.applied = draft.raw;
      if (same && hasChanges(draft.brief, brief)) nextDraft.previous = schedule(draft.brief);
      const base = same ? project
        : campaignProject(nextDraft.edition, brief, undefined, undefined, nextDraft.workingId);
      const next = choice
        ? await applyCampaignLibraryBackground(base, choice.row, choice.file)
        : checkpoint(base, "移除图库背景");
      next.current.brief = brief;
      if (!choice) {
        delete next.current.heroId;
        delete next.current.artworkPalette;
      }
      const saved = await saveCampaignProject(next, same ? project.updated : undefined);
      setLinked(saved);
      setDraft({ ...nextDraft, workingId: saved.id, projectId: saved.id });
      say(choice ? "图库背景已应用到三种画幅" : "已恢复版式默认背景");
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  function generateCopy() {
    if (!model || dirty || projectPending) return;
    run("copy", async () => {
      selectProjectTrace(project.id, draft.brief.title);
      const concept = await writeInvitation(draft.brief);
      await storeChanges({ ...draft, concept });
      say("邀请文案已更新");
    });
  }
  async function paintArtwork(base: Project, useDirection = true) {
    if (Object.keys(base.assets).length >= 20)
      throw Error("项目中已有 20 个素材，请在编辑器中整理后重试。");
    const snapshot = base.current;
    const body = JSON.stringify({
      ...modelField(chosenModels.campaignArt),
      title: snapshot.brief.title,
      description: snapshot.brief.description,
      edition: snapshot.edition,
      art_direction:
        (useDirection && snapshot.campaignCopy?.art_direction) || "",
    });
    const request = await prepareArtworkRequest(
      base.id,
      body,
      artworkRequest.current,
    );
    artworkRequest.current = request;
    const image = await withStep(
      "artwork",
      chosenModels.campaignArt || artworkModel,
      async () => {
        const response = await studioFetch("/outreach/artwork", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": request.key,
          },
          body,
        });
        const image = await response.json().catch(() => null);
        if (!response.ok || typeof image?.data_url !== "string") {
          if (response.headers.get("X-PosterLab-Reusable") !== "1") {
            clearArtworkRequest(request);
            artworkRequest.current = null;
          }
          throw new Error(
            typeof image?.detail === "string"
              ? image.detail
              : "未取得主视觉，当前配图已保留。",
          );
        }
        return image;
      },
      () => "已收到该活动的主视觉图片。",
    );
    const saved = await withStep(
      "apply",
      "本机画布",
      async () => {
        const next = await applyCampaignArtwork(base, image.data_url);
        return saveCampaignProject(next, base.updated);
      },
      () => "竖版海报、社交方图和横版封面已共用这张主视觉。",
    );
    setLinked(saved);
    setDraft((d) => ({ ...d, projectId: saved.id }));
    clearArtworkRequest(request);
    artworkRequest.current = null;
  }
  function openFacts(mode: "schedule" | "facts" | "qr") {
    edit({ ...draft.brief });
    setError("");
    setModal(mode);
  }
  async function storeChanges(next: Draft, keepArtwork = false) {
    if (linked && next.projectId === linked.id) {
      const snap = {
        ...linked.current,
        brief: next.brief,
        campaignPlan: next.plan,
      };
      if (next.concept) {
        snap.campaignCopy = {
          model: next.concept.model,
          invitation: next.concept.invitation,
          reason: next.concept.reason,
          art_direction: next.concept.art_direction,
        };
        if (next.concept.tag !== draft.concept?.tag)
          snap.displayTitle = next.concept.tag;
      } else delete snap.campaignCopy;
      if (next.edition !== snap.edition) {
        snap.edition = next.edition;
        snap.theme = editions[next.edition].theme;
        if (!keepArtwork && !(snap.heroId && linked.assets[snap.heroId]?.library)) delete snap.heroId;
      }
      const saved = await saveCampaignProject(
        { ...linked, current: snap },
        linked.updated,
      );
      next = { ...next, projectId: saved.id };
      setLinked(saved);
      setDraft(next);
      return saved;
    }
    setDraft(next);
    return campaignProject(
      next.edition,
      next.brief,
      next.concept,
      next.plan,
      next.workingId,
    );
  }
  async function saveReleasePlan(plan: CampaignPlan) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setError("");
    setBusy("plan");
    try {
      if (linked?.id === project.id) {
        await storeChanges({ ...draft, plan });
      } else {
        const saved = await saveCampaignProject({
          ...project,
          current: { ...project.current, campaignPlan: plan },
        });
        setLinked(saved);
        setDraft({ ...draft, plan, projectId: saved.id });
      }
      say("发布计划已保存");
      return true;
    } catch (e) {
      setError((e as Error).message || "保存未完成，请重试。");
      return false;
    } finally {
      busyRef.current = false;
      setBusy("");
    }
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
  async function run(action: string, fn: () => Promise<unknown>) {
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
  function openExport(format: Format | "all") {
    setExportFormat(format);
    setError("");
    setModal("export");
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
  function downloadDrawio(f: Format) {
    run("drawio", async () => {
      const { exportCampaignDrawio } = await import("./campaign-drawio");
      download(
        await exportCampaignDrawio(project, f),
        name + "-" + formats[f].name + ".drawio",
      );
      say("可编辑源文件已下载");
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
  function renderWorkspace() {
    return (
      <main className="cp-shell">
        <header className="wx-campaign-title">
          <h1>活动宣传</h1>
          {model && <WorkflowModels context="campaign" disabled={!!busy} />}
          <p>
            把活动通知做成海报、朋友圈配图和活动页封面，配好从预告到当天的发布文案。
          </p>
        </header>
        <section className="cp-hero" aria-label="活动创作台">
          <div className="cp-intro">
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
                rows={5}
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
                    使用模型编排
                    <small>
                      {artworkModel
                        ? "为这场活动创作主视觉、撰写邀请文案并排出三种画幅"
                        : "根据通知选择版式并撰写邀请文案"}
                    </small>
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
                    checkingModel ||
                    !draft.raw.trim() ||
                    !!busy ||
                    projectPending ||
                    (!dirty && !!allErrors.length)
                  }
                >
                  {(busy === "generate" || busy === "generate-art") && (
                    <LoaderCircle className="wx-spin" size={16} />
                  )}
                  {checkingModel
                    ? "正在连接服务…"
                    : busy === "generate-art"
                      ? "正在绘制活动主视觉…"
                      : busy === "generate"
                        ? model && useModel
                          ? "正在策划海报和文案…"
                          : "正在排版…"
                        : model && useModel
                          ? "生成宣传套装"
                          : "生成并预览"}{" "}
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
            <NoticeExamples busy={!!busy} choose={(text) => {
              setDraft((previous) => ({...previous, raw: text})); setError("");
              requestAnimationFrame(() => textarea.current?.focus());
            }} />
            {!modal && <CampaignSteps title={traceTitle} steps={trace} />}
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
              <div className="wx-board-actions">
                <BackgroundLibrary
                  selected={libraryCredit}
                  disabled={!!busy || projectPending}
                  scope="同一张背景用于竖版海报、社交方图和横版封面。"
                  apply={(row, file) => changeLibraryBackground({ row, file })}
                  clear={() => changeLibraryBackground()}
                />
                {artworkModel && (
                  <button
                    type="button"
                    disabled={inactive}
                    onClick={generateArtwork}
                  >
                    {busy === "artwork" ? (
                      <LoaderCircle className="wx-spin" size={15} />
                    ) : (
                      <ImagePlus size={15} />
                    )}
                    {busy === "artwork" ? "正在生成主视觉…" : "生成主视觉"}
                  </button>
                )}
                <button
                  onClick={() =>
                    preview(proofFormat === "all" ? "portrait" : proofFormat)
                  }
                >
                  <Expand size={14} /> 放大查看
                </button>
              </div>
            </div>
            {libraryCredit && <p className="bl-current">图库 · {libraryCredit.name} · {libraryCredit.source} · {libraryCredit.license}</p>}
            <div
              className={
                "cp-spread" + (proofFormat === "all" ? "" : " wx-proof-single")
              }
              aria-label="画幅预览"
            >
              {channels
                .filter((c) => proofFormat === "all" || c.id === proofFormat)
                .map((c) => (
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
              <div className="wx-views" role="group" aria-label="选择预览画幅">
                <button
                  type="button"
                  aria-pressed={proofFormat === "all"}
                  onClick={() => setProofFormat("all")}
                >
                  全套
                </button>
                {channels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={proofFormat === c.id}
                    onClick={() => setProofFormat(c.id)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
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
                  ? "模型初稿 · " + project.current.campaignCopy.model
                  : "发布材料"}
              </div>
              <h2 id="cp-delivery-title">{draft.brief.title}</h2>
            </div>
            <div className="ce-launchers">
              <button
                className="ce-backup"
                onClick={pack}
                disabled={inactive || !!allErrors.length}
              >
                {busy === "pack" ? (
                  <LoaderCircle className="cp-spin" size={15} />
                ) : (
                  <Download size={15} />
                )}
                {busy === "pack" ? "正在打包" : "下载整套 ZIP"}
              </button>
              <button
                className="cp-dark"
                onClick={() => openExport(proofFormat)}
                disabled={inactive}
              >
                <FolderOutput size={16} /> 按渠道导出
              </button>
            </div>
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
                  <b>选版说明</b> {draft.concept.reason}
                </p>
              )}
            </div>
            <div className="cp-message">
              <div className="cp-fileshead">
                <b>
                  <MessageCircle size={17} /> 发布文案
                </b>
                {model && (
                  <button
                    type="button"
                    className="cp-textbutton"
                    onClick={generateCopy}
                    disabled={inactive}
                  >
                    {busy === "copy"
                      ? "正在撰写…"
                      : project.current.campaignCopy
                        ? "重写邀请文案"
                        : "生成邀请文案"}
                  </button>
                )}
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
              <a className="release-link cp-textbutton" href="#campaign/plan">
                打开活动发布计划 <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </section>
        <WorkroomCases kind="campaign" />
      </main>
    );
  }
  return (
    <div id="publicity-studio" className="campaign ds-workroom ds-campaign">
      <CampaignNav active="home" />
      {STATIC_DEMO && (
        <div className="cp-shell" style={{ paddingBlock: 12 }}>
          <LiveStudioLink route="#campaign" />
        </div>
      )}
      {planView ? (
        <CampaignReleasePlan
          project={project}
          layouts={layouts}
          inactive={inactive}
          name={name}
          packDisabled={inactive || !!allErrors.length}
          busy={busy}
          dirty={dirty}
          error={modal ? "" : error}
          pack={pack}
          png={png}
          preview={preview}
          schedule={() => openFacts("schedule")}
          savePlan={saveReleasePlan}
          notify={say}
        />
      ) : (
        renderWorkspace()
      )}
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
                ? "保存后，海报、各阶段文案和建议发布日一起更新。"
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
      {modal === "export" && (
        <Modal
          name="按渠道导出"
          large
          locked={!!busy}
          close={() => {
            setModal(null);
            setError("");
          }}
        >
          <CampaignExport
            project={project}
            initialFormat={exportFormat}
            updateCopy={updateCopy}
            layouts={layouts}
            busy={!!busy}
            name={name}
            error={error}
            run={run}
            complete={() => {
              setModal(null);
              say("所选文件已下载");
            }}
          />
        </Modal>
      )}
      {modal === "preview" && (
        <Modal large name="查看发布成品" close={() => setModal(null)}>
          <div className="cp-previewtabs">
            {channels.map((c) => (
              <button
                key={c.id}
                aria-pressed={selected === c.id}
                disabled={busy === "review"}
                onClick={() => {
                  select(c.id);
                  setError("");
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="cp-zoom">
            <Proof svg={layouts[selected].svg} />
          </div>
          <CampaignSteps title={traceTitle} steps={trace} />
          {visionModel && (
            <section className="cp-art-review" aria-label="AI 审片">
              <WorkflowModels context="review" disabled={!!busy} />
              {currentReview ? (
                <>
                  <strong>审片意见 · {formats[selected].name}</strong>
                  <p>{currentReview.summary}</p>
                  <ul>
                    {currentReview.priorities.map((item) => (
                      <li key={item.name}>
                        <b>{item.name}</b>
                        <span>{item.suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <button
                  type="button"
                  className="cp-textbutton"
                  disabled={inactive}
                  onClick={inspectProof}
                >
                  {busy === "review" ? (
                    <LoaderCircle className="wx-spin" size={15} />
                  ) : (
                    <Expand size={15} />
                  )}
                  {busy === "review" ? "正在审阅当前画幅…" : "AI 审片"}
                </button>
              )}
            </section>
          )}
          <div className="cp-previewactions">
            {!planView && (
              <a
                className="release-link cp-textbutton"
                href="#campaign/plan"
                onClick={() => setModal(null)}
              >
                发布计划 <ArrowRight size={14} />
              </a>
            )}
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
              className="cp-textbutton"
              disabled={inactive}
              onClick={() => downloadDrawio(selected)}
              title="在 draw.io 中编辑当前画幅的文字、照片和装饰"
            >
              {busy === "drawio" ? "正在导出…" : "下载 .drawio"}
            </button>
            <button
              className="cp-dark"
              disabled={inactive}
              onClick={() => openExport(selected)}
            >
              按渠道导出
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
