import { releaseCalendar, releasePlan } from "./campaign-plan";
import { creditText } from "./background-library";
import { formats, type Format, type Project } from "./model";
import { exportBlob } from "./render";

export type ExportSelection = {
  formats: Format[];
  imageType: "png" | "jpg" | "drawio";
  copy: boolean;
  calendar: boolean;
};

type FileSpec =
  | { filename: string; format: Format; type: ExportSelection["imageType"] }
  | { filename: string; text: string; mime: string };

export function campaignExportFiles(
  project: Project,
  selection: ExportSelection,
  updateCopy = "",
) {
  const files: FileSpec[] = selection.formats.map((format) => ({
    filename: formats[format].name + "." + selection.imageType,
    format,
    type: selection.imageType,
  }));
  const entries = releasePlan(project);
  if (selection.copy) {
    for (const entry of entries) {
      files.push({
        filename: entry.name + ".txt",
        text: entry.copy,
        mime: "text/plain",
      });
    }
    if (updateCopy)
      files.push({
        filename: "改期通知.txt",
        text: updateCopy,
        mime: "text/plain",
      });
  }
  if (selection.calendar && project.current.brief.date) {
    const calendar = releaseCalendar(project, entries, (format) =>
      selection.formats.includes(format)
        ? formats[format].name + "." + selection.imageType
        : formats[format].name,
    );
    files.push({
      filename: "发布日历.ics",
      text: calendar,
      mime: "text/calendar",
    });
  }
  return files;
}

export async function exportSelection(
  project: Project,
  files: FileSpec[],
  name: string,
) {
  if (!files.length) throw new Error("请选择要导出的文件。");
  const read = async (file: FileSpec) => {
    if (!("format" in file))
      return new Blob([file.text], { type: file.mime + ";charset=utf-8" });
    if (file.type === "drawio") {
      const { exportCampaignDrawio } = await import("./campaign-drawio");
      return exportCampaignDrawio(project, file.format);
    }
    return exportBlob(project, file.format, file.type);
  };

  if (files.length === 1) {
    return {
      blob: await read(files[0]),
      filename: name + "-" + files[0].filename,
    };
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const file of files) zip.file(file.filename, await read(file));
  const library = project.current.heroId ? project.assets[project.current.heroId]?.library : undefined;
  if (library && files.some(file => "format" in file)) zip.file("背景图来源.txt", creditText(library));
  return {
    blob: await zip.generateAsync({ type: "blob" }),
    filename: name + "-渠道发布包.zip",
  };
}
