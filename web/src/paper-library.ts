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
function open() {
  return openDB<Library>("posterlab-paper-library", 1, {
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
    return readSavedPaper(await db.get("papers", id));
  } finally {
    db.close();
  }
}

type Resume = { paper: Paper; pendingWrite?: boolean } | { libraryId: string };

export function resumePaper(initial: () => Paper): Resume {
  try {
    const raw = localStorage.getItem(paperKey);
    if (raw) {
      const value = JSON.parse(raw);
      if (typeof value?.libraryId === "string" && value.libraryId)
        return { libraryId: value.libraryId };
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
  let cached = false;
  // A rendered cover can exceed the complete localStorage quota on its own.
  // Small legacy drafts remain readable without opening IndexedDB.
  if (
    (paper.artwork?.data.length || 0) + (paper.figure?.data.length || 0) <
    1_000_000
  ) {
    try {
      // A reload can interrupt the IndexedDB write after the synchronous
      // cache has succeeded. Mark that exact revision for replay on startup.
      localStorage.setItem(
        paperKey,
        JSON.stringify(
          initial ? paper : { ...paper, pendingLibraryWrite: writeId },
        ),
      );
      cached = true;
    } catch {}
  }
  try {
    await keepPaper(paper, initial);
  } catch {
    if (save !== latestSave) return;
    if (cached) throw Error("论文库暂不可用，本次草稿已保存在浏览器中。");
    try {
      localStorage.setItem(
        paperKey,
        JSON.stringify({ ...paper, pendingLibraryWrite: writeId }),
      );
    } catch {
      throw Error("浏览器无法保存当前草稿，请下载宣传材料备份。");
    }
    throw Error("论文库暂不可用，本次草稿已保存在浏览器中。");
  }
  if (save !== latestSave) return;
  if (cached && !initial) {
    try {
      const current = JSON.parse(localStorage.getItem(paperKey) || "null");
      if (current?.pendingLibraryWrite === writeId)
        localStorage.setItem(paperKey, JSON.stringify(paper));
    } catch {
      /* The committed snapshot can safely be replayed. */
    }
  } else if (!cached) {
    try {
      // Publish the pointer only once the whole paper is durable. Replacing the
      // stale full copy prevents it from overwriting the new art on refresh.
      localStorage.setItem(paperKey, JSON.stringify({ libraryId: paper.id }));
    } catch {
      throw Error("草稿已保存到论文库，可从「我的论文」重新打开。");
    }
  }
}
