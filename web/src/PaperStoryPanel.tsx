import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  Layers3,
  Plus,
  Trash2,
} from "lucide-react";
import Dialog from "./PaperDialog";
import { type Paper, sentences } from "./paper-model";
import {
  evidenceCard,
  moveStoryCard,
  paperStory,
  storyLimit,
  storyIssue,
  storyRoles,
  type StoryCard,
} from "./paper-story-model";
import { drawStoryCard, storyPack } from "./paper-story-art";
import { download } from "./render";
import "./paper-story.css";

function CardImage({
  paper,
  card,
  index,
  total,
  large = false,
}: {
  paper: Paper;
  card: StoryCard;
  index: number;
  total: number;
  large?: boolean;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    setError(false);
    drawStoryCard(paper, card, index, total, large ? 750 : 180)
      .then((canvas) => {
        if (current) host.current?.replaceChildren(canvas);
      })
      .catch(() => {
        if (current) {
          host.current?.replaceChildren();
          setError(true);
        }
      });
    return () => {
      current = false;
    };
  }, [
    card,
    index,
    total,
    large,
    paper.title,
    paper.byline,
    paper.figure,
    paper.sample,
  ]);
  return (
    <span
      role="img"
      aria-label={card.title + " · 页面预览"}
      className="ps-canvas"
      ref={host}
    >
      {error ? "预览载入失败" : null}
    </span>
  );
}
export default function PaperStoryPanel({
  paper,
  apply,
}: {
  paper: Paper;
  apply: (story: StoryCard[]) => void;
}) {
  const cards = useMemo(
    () => paperStory(paper),
    [paper.story, paper.headline, paper.title, paper.evidence],
  );
  const [selected, setSelected] = useState<string | null>(() =>
    location.hash === "#papers/story" ? cards[0].id : null,
  );
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const [beforeRemove, setBeforeRemove] = useState<{
    card: StoryCard;
    at: number;
  } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const route = () => {
      if (location.hash === "#papers/story") setSelected(cards[0].id);
      else setSelected(null);
    };
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, [cards]);
  const index = Math.max(
    0,
    cards.findIndex((c) => c.id === selected),
  );
  const card = cards[index],
    cover = card.role === "封面";
  const editing = !!selected;
  const sourceSentences = useMemo(
    () => (editing ? sentences(paper.body) : []),
    [editing, paper.body],
  );
  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...paper.evidence.map((e) => e.quote),
            ...sourceSentences,
            card.quote,
          ].filter(Boolean),
        ),
      ),
    [paper.evidence, sourceSentences, card.quote],
  );
  const issue = editing ? storyIssue(paper) : "";
  function close() {
    setSelected(null);
    if (location.hash === "#papers/story")
      history.replaceState(null, "", "#papers");
  }
  function update(delta: Partial<StoryCard>) {
    apply(cards.map((c, i) => (i === index ? { ...c, ...delta } : c)));
  }
  function add() {
    const evidence =
      paper.evidence.find((e) => !cards.some((c) => c.quote === e.quote)) ||
      paper.evidence[0];
    const next = evidenceCard(paper, evidence, crypto.randomUUID());
    apply([...cards, next]);
    setSelected(next.id);
    setStatus("");
  }
  function remove() {
    setBeforeRemove({ card, at: index });
    apply(cards.filter((c) => c.id !== card.id));
    setSelected(cards[index - 1].id);
    setStatus("");
  }
  function restore() {
    if (!beforeRemove) return;
    const next = [...cards];
    next.splice(beforeRemove.at, 0, beforeRemove.card);
    apply(next);
    setSelected(beforeRemove.card.id);
    setBeforeRemove(null);
  }
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setStatus("");
    try {
      const zip = await storyPack(paper);
      const name =
        paper.headline.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").slice(0, 48) ||
        "论文";
      download(zip, name + "-论文图解长帖.zip");
      setStatus(cards.length + " 张 PNG、发布文案和逐卡引文已打包");
    } catch (e) {
      setStatus((e as Error).message || "下载失败，请重试。");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function edit(id: string) {
    setSelected(id);
    setStatus("");
  }
  return (
    <>
      <section className="ps-shelf" aria-label="论文图解长帖">
        <div className="ps-summary">
          <span className="ps-callout">
            <Layers3 size={17} />
            图文轮播
          </span>
          <h2>论文图解长帖</h2>
          <p>{cards.length} 张卡片 · 1080 × 1440</p>
          <button onClick={() => edit(cards[0].id)}>
            编排图组 <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="ps-film">
          {cards.map((c, i) => (
            <button
              key={c.id}
              aria-label={`编辑第 ${i + 1} 张${c.role}卡`}
              onClick={() => edit(c.id)}
            >
              <CardImage
                paper={paper}
                card={c}
                index={i}
                total={cards.length}
              />
              <span className="ps-film-caption">
                <b>{String(i + 1).padStart(2, "0")}</b>
                {c.role}
                <strong>{c.title}</strong>
              </span>
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <Dialog className="ps-dialog" title="编排论文图解长帖" close={close}>
          <div className="ps-strip" aria-label="选择卡片">
            {cards.map((c, i) => (
              <button
                key={c.id}
                aria-pressed={i === index}
                onClick={() => setSelected(c.id)}
              >
                {String(i + 1).padStart(2, "0")} {c.role}
              </button>
            ))}
            <button
              onClick={add}
              disabled={cards.length >= storyLimit}
              aria-label="添加摘录卡"
            >
              <Plus size={15} /> 加一页
            </button>
          </div>
          <div className="ps-workspace">
            <div className="ps-proof">
              <CardImage
                paper={paper}
                card={card}
                index={index}
                total={cards.length}
                large
              />
            </div>
            <div className="ps-form">
              <div className="ps-edithead">
                <h3>
                  第 {index + 1} 张 · {card.role}
                </h3>
                {!cover && (
                  <div className="ps-order">
                    <button
                      title="前移一页"
                      aria-label="前移一页"
                      disabled={index <= 1}
                      onClick={() => apply(moveStoryCard(cards, index, -1))}
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <button
                      title="后移一页"
                      aria-label="后移一页"
                      disabled={index >= cards.length - 1}
                      onClick={() => apply(moveStoryCard(cards, index, 1))}
                    >
                      <ArrowRight size={17} />
                    </button>
                    <button
                      title="移除本页"
                      aria-label="移除本页"
                      disabled={cards.length <= 2}
                      onClick={remove}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              {!cover && (
                <label>
                  卡片类型
                  <select
                    value={card.role}
                    onChange={(e) =>
                      update({ role: e.target.value as StoryCard["role"] })
                    }
                  >
                    {storyRoles
                      .filter((r) => r !== "封面")
                      .map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                卡片标题
                <input
                  value={card.title}
                  maxLength={500}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label>
                {cover ? "封面副标题" : "卡片解读"}
                <textarea
                  value={card.body}
                  maxLength={3000}
                  rows={cover ? 3 : 4}
                  onChange={(e) => update({ body: e.target.value })}
                />
              </label>
              {cover ? (
                <div className="ps-citation">
                  <strong>论文出处</strong>
                  <p>{paper.title}</p>
                  {paper.byline && <small>{paper.byline}</small>}
                </div>
              ) : (
                <div className="ps-citation">
                  <strong>支撑本页的原句</strong>
                  <blockquote>{card.quote}</blockquote>
                  <details key={card.id}>
                    <summary>更换原句与解读</summary>
                    <label>
                      选择论文原句
                      <select
                        value={card.quote}
                        onChange={(e) => {
                          const quote = e.target.value;
                          const source = paper.evidence.find(
                            (item) => item.quote === quote,
                          ) || { quote, line: quote };
                          const next = evidenceCard(paper, source, card.id);
                          update({
                            quote,
                            body: next.body,
                            title: next.title,
                            role: next.role,
                          });
                        }}
                      >
                        {sourceOptions.map((s, i) => (
                          <option value={s} key={s}>
                            {i + 1}. {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small>选择后，卡片会采用该原句对应的标题与解读。</small>
                  </details>
                </div>
              )}
              {beforeRemove && cards.length < storyLimit && (
                <button className="ps-undo" onClick={restore}>
                  撤销移除「{beforeRemove.card.title}」
                </button>
              )}
            </div>
          </div>
          <div className="ps-foot">
            <span>{cards.length} 张 PNG、发布文案与逐卡引文</span>
            <button
              className="pr-action"
              disabled={busy || !!issue}
              onClick={save}
            >
              <Download size={16} />
              {busy ? "正在打包…" : "下载图组 ZIP"}
            </button>
          </div>
          {issue && (
            <p className="ps-status" role="status">
              {issue}
            </p>
          )}
          {status && (
            <p className="ps-status" role="status">
              {status}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
