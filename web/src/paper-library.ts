import { workspaceKey } from "./workspace";
import { openDB, type DBSchema } from "idb";
import {
  paperKey,
  readSavedPaper,
  recoverPaper,
  type Paper,
} from "./paper-model";
type Entry = { id: string; title: string; saved: string };
interface Library extends DBSchema {
  papers: { key: string; value: Paper };
  index: { key: string; value: Entry };
}
let lastDurable: Paper | undefined;
function open() {
  return openDB<Library>(workspaceKey("posterlab-paper-library"), 1, {
    upgrade(db) {
      db.createObjectStore("papers", { keyPath: "id" });
      db.createObjectStore("index", { keyPath: "id" });
    },
  });
}
export async function keepPaper(p: Paper, insertOnly = false) {
  const db = await open();
  try {
    const tx = db.transaction(["papers", "index"], "readwrite");
    // A legacy local snapshot may be older than the previously saved library
    // draft. Merely opening that snapshot must never replace an existing copy.
    if (
      insertOnly &&
      (await tx.objectStore("papers").getKey(p.id)) !== undefined
    ) {
      await tx.done;
      return;
    }
    await Promise.all([
      tx.objectStore("papers").put(p),
      tx
        .objectStore("index")
        .put({ id: p.id, title: p.headline, saved: new Date().toISOString() }),
      tx.done,
    ]);
    lastDurable = p;
  } finally {
    db.close();
  }
}
export async function paperEntries() {
  const db = await open();
  try {
    return (await db.getAll("index")).sort((a, b) =>
      b.saved.localeCompare(a.saved),
    );
  } finally {
    db.close();
  }
}
export async function openPaper(id: string) {
  const db = await open();
  try {
    const paper = readSavedPaper(await db.get("papers", id));
    lastDurable = paper;
    return paper;
  } finally {
    db.close();
  }
}

type LibraryPointer = {
  libraryId: string;
  pendingFields?: Record<string, unknown>;
};
type Resume = { paper: Paper; pendingWrite?: boolean } | LibraryPointer;

export async function restoreLibraryDraft(
  pointer: LibraryPointer,
): Promise<Paper> {
  const stored = await openPaper(pointer.libraryId);
  if (!pointer.pendingFields) return stored;
  // The synchronous journal contains only editable fields. Both original image
  // blobs stay in IndexedDB and are always restored from the same paper.
  return readSavedPaper({
    ...pointer.pendingFields,
    id: stored.id,
    artwork: stored.artwork,
    figure: stored.figure,
    visuals: stored.visuals,
  });
}

export function resumePaper(initial: () => Paper): Resume {
  try {
    const raw = localStorage.getItem(paperKey);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value?.libraryId === "string" && value.libraryId)
        return {
          libraryId: value.libraryId,
          pendingFields: value.pendingFields,
        };
      return {
        paper: recoverPaper(raw),
        pendingWrite: typeof value?.pendingLibraryWrite === "string",
      };
    }
  } catch {}
  return { paper: initial() };
}

let latestSave = 0;
export async function savePaperDraft(
  paper: Paper,
  initial: boolean,
): Promise<void> {
  const save = ++latestSave;
  const writeId = crypto.randomUUID();
  const { artwork, figure, visuals, ...fields } = paper;
  const large =
    (artwork?.data.length || 0) + (figure?.data.length || 0)
      + (visuals || []).reduce((total,v)=>total+v.data.length,0) >= 1_000_000;
  const unchangedImages =
    lastDurable?.id === paper.id &&
    lastDurable.artwork?.data === artwork?.data &&
    lastDurable.figure?.data === figure?.data &&
    lastDurable.figure?.credit === figure?.credit &&
    lastDurable.visuals === visuals &&
    lastDurable.artwork?.model === artwork?.model;
  const pending = initial ? undefined : writeId;
  let cached = false;
  try {
    // Journal edits synchronously before the async transaction. Large drafts
    // reuse durable image blobs instead of rewriting megabytes for a copy edit.
    const snapshot =
      large && unchangedImages
        ? {
            libraryId: paper.id,
            pendingFields: initial ? undefined : fields,
            pendingLibraryWrite: pending,
          }
        : { ...paper, pendingLibraryWrite: pending };
    localStorage.setItem(paperKey, JSON.stringify(snapshot));
    cached = true;
  } catch {}
  try {
    await keepPaper(paper, initial);
  } catch {
    if (save !== latestSave) return;
    if (cached) throw Error("论文库暂不可用，本次草稿已保存在浏览器中。");
    throw Error("浏览器无法保存当前草稿，请下载宣传材料备份。");
  }
  if (save !== latestSave) return;
  try {
    if (cached && !initial) {
      // Another tab may already have made a different draft active.
      const active = JSON.parse(localStorage.getItem(paperKey) || "null");
      if (active?.pendingLibraryWrite !== writeId) return;
    }
    if (large || !cached)
      localStorage.setItem(paperKey, JSON.stringify({ libraryId: paper.id }));
    else if (!initial) localStorage.setItem(paperKey, JSON.stringify(paper));
  } catch {
    if (!cached) throw Error("草稿已保存到论文库，可从「我的论文」重新打开。");
  }
}
