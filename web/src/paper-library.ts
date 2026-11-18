import { openDB, type DBSchema } from "idb";
import { paperSchema, type Paper } from "./paper-model";
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
export async function keepPaper(p: Paper) {
  const db = await open();
  try {
    const tx = db.transaction(["papers", "index"], "readwrite");
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
    return paperSchema.parse(await db.get("papers", id));
  } finally {
    db.close();
  }
}
