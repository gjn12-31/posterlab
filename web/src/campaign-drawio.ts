import { drawioBlob, type DrawioElement } from "./drawio";
import { editionImage } from "./editions";
import { creditText } from "./background-library";
import {
  formats,
  labels,
  type Field,
  type Format,
  type Project,
} from "./model";
import { loadFonts, renderPoster } from "./render";

const svgNS = "http://www.w3.org/2000/svg";
type Box = Pick<DrawioElement, "x" | "y" | "width" | "height">;
const numberAttr = (node: Element, name: string) =>
  Number(node.getAttribute(name));

function box(node: Element): Box {
  return {
    x: numberAttr(node, "x"),
    y: numberAttr(node, "y"),
    width: numberAttr(node, "width"),
    height: numberAttr(node, "height"),
  };
}

async function inlinePhotography(svg: SVGSVGElement, project: Project) {
  const stock = editionImage(project.current.edition!);
  for (const image of svg.querySelectorAll("image")) {
    const href = image.getAttribute("href") || "";
    if (/^data:image\/(png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(href))
      continue;
    if (href !== stock) throw Error("海报包含无法嵌入的图片。");
    const response = await fetch(stock);
    if (!response.ok) throw Error("主视觉读取失败，请重试导出。");
    const photo = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("主视觉读取失败。"));
      reader.readAsDataURL(photo);
    });
    image.setAttribute("href", data);
  }
}

function textCell(group: SVGGElement): DrawioElement {
  const text = group.querySelector("text")!;
  const rect = group.querySelector("rect")!;
  const position = group.transform.baseVal.consolidate()!.matrix;
  const field = group.getAttribute("data-layer")!;
  const name =
    labels[field as Field] ||
    (field === "display"
      ? "视觉题签"
      : field === "credit"
        ? "署名"
        : "自由文字");
  return {
    ...box(rect),
    x: position.e,
    y: position.f,
    name,
    type: "text",
    layer: "可编辑文字",
    text: Array.from(
      text.querySelectorAll("tspan"),
      (line) => line.textContent || "",
    ).join("\n"),
    fontSize: numberAttr(text, "font-size"),
    lineHeight: 1.15,
    color: text.getAttribute("fill")!,
    bold: numberAttr(text, "font-weight") >= 600,
    italic: text.getAttribute("font-style") === "italic",
    fontFamily: text.getAttribute("font-family")?.startsWith("Georgia")
      ? "Georgia, Noto Serif CJK SC, Songti SC, SimSun, serif"
      : "Noto Sans CJK SC, PingFang SC, Microsoft YaHei, Arial, sans-serif",
    align: "left",
    verticalAlign: "top",
  };
}

function vectorBounds(node: SVGGraphicsElement, root: SVGSVGElement): Box {
  const bounds = node.getBBox();
  const matrix = root.getScreenCTM()!.inverse().multiply(node.getScreenCTM()!);
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
  // SVG getBBox excludes the pen stroke. Keep the full stroke and antialiased edge.
  const x = Math.max(
    0,
    Math.floor(Math.min(...corners.map((point) => point.x))) - 2,
  );
  const y = Math.max(
    0,
    Math.floor(Math.min(...corners.map((point) => point.y))) - 2,
  );
  return {
    x,
    y,
    width:
      Math.min(
        root.viewBox.baseVal.width,
        Math.ceil(Math.max(...corners.map((p) => p.x))) + 2,
      ) - x,
    height:
      Math.min(
        root.viewBox.baseVal.height,
        Math.ceil(Math.max(...corners.map((p) => p.y))) + 2,
      ) - y,
  };
}

async function imageCell(
  node: SVGGraphicsElement,
  root: SVGSVGElement,
  bounds: Box,
  name: string,
): Promise<DrawioElement> {
  const picture = document.createElementNS(svgNS, "svg");
  picture.setAttribute("width", String(bounds.width));
  picture.setAttribute("height", String(bounds.height));
  picture.setAttribute(
    "viewBox",
    [bounds.x, bounds.y, bounds.width, bounds.height].join(" "),
  );
  // Definitions are gradients and clip paths from the locally generated scene.
  // Rasterize this one object only. Text never enters an image cell.
  for (const defs of root.querySelectorAll(":scope > defs"))
    picture.appendChild(defs.cloneNode(true));
  picture.appendChild(node.cloneNode(true));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(picture)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = name === "报名二维码" ? 3 : 1;
    canvas.width = Math.max(1, Math.round(bounds.width * scale));
    canvas.height = Math.max(1, Math.round(bounds.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let opaquePhoto = name === "主视觉" && !node.hasAttribute("clip-path");
    if (opaquePhoto) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i] !== 255) {
          opaquePhoto = false;
          break;
        }
    }
    const src = canvas.toDataURL(
      opaquePhoto ? "image/jpeg" : "image/png",
      0.94,
    );
    return {
      type: "image",
      ...bounds,
      src,
      name,
      layer: name === "报名二维码" ? "报名二维码" : "图像与装饰",
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ruleCell(path: SVGGraphicsElement): DrawioElement | undefined {
  const horizontal = /^M([\d.+-]+)\s+([\d.+-]+)\s+H([\d.+-]+)$/i.exec(
    path.getAttribute("d") || "",
  );
  if (!horizontal || !path.hasAttribute("stroke")) return;
  const [, x1, y, x2] = horizontal.map(Number);
  const width = numberAttr(path, "stroke-width") || 1;
  return {
    type: "rect",
    name: "分隔线",
    x: Math.min(x1, x2),
    y: y - width / 2,
    width: Math.abs(x2 - x1),
    height: width,
    fill: path.getAttribute("stroke")!,
    opacity: 100 * Number(path.getAttribute("stroke-opacity") || 1),
    layer: "图像与装饰",
  };
}

export async function exportCampaignDrawio(
  project: Project,
  format: Format,
): Promise<Blob> {
  if (project.current.layout !== "campaign" || !project.current.edition)
    throw Error("请选择活动海报。");
  const s = project.current;
  await loadFonts(
    [
      ...Object.values(s.brief),
      s.displayTitle || "",
      s.creditLine || "",
      ...(s.notes || []).map((note) => note.text),
    ].join(""),
  );
  const rendered = renderPoster(project, format);
  const root = new DOMParser().parseFromString(rendered.svg, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
  if (root.localName !== "svg") throw Error("无法读取当前海报画布。");
  await inlinePhotography(root, project);
  const elements: DrawioElement[] = [];
  const { width, height, name } = formats[format];
  // Mount to measure the exact bounds of transformed paths in the browser's SVG engine.
  root.style.cssText = `position:fixed;top:0;left:-20000px;width:${width}px;height:${height}px;max-width:none;visibility:hidden;pointer-events:none`;
  root.setAttribute("aria-hidden", "true");
  document.body.appendChild(root);
  try {
    let hasPhoto = false;
    for (const raw of root.children) {
      if (raw.localName === "defs") continue;
      const node = raw as SVGGraphicsElement;
      if (node.hasAttribute("data-layer")) {
        elements.push(textCell(node as SVGGElement));
      } else if (
        node.localName === "rect" &&
        !node.getAttribute("fill")?.startsWith("url(")
      ) {
        const background = !elements.length;
        elements.push({
          type: "rect",
          ...box(node),
          fill: node.getAttribute("fill")!,
          name: background ? "底色" : "强调色条",
          layer: background ? "底色" : "图像与装饰",
        });
      } else if (node.localName === "image" || node.localName === "svg") {
        const isPhoto =
          node.localName === "image" || !!node.querySelector("image");
        const label = !isPhoto
          ? "报名二维码"
          : hasPhoto
            ? "品牌标识"
            : "主视觉";
        if (isPhoto) hasPhoto = true;
        elements.push(await imageCell(node, root, box(node), label));
      } else {
        const line = node.localName === "path" && ruleCell(node);
        if (line) elements.push(line);
        else {
          const isShade = node.localName === "rect";
          elements.push(
            await imageCell(
              node,
              root,
              isShade ? box(node) : vectorBounds(node, root),
              isShade
                ? "标题渐变"
                : node.localName === "g"
                  ? "图形标记"
                  : "装饰轮廓",
            ),
          );
        }
      }
    }
    const library = s.heroId ? project.assets[s.heroId]?.library : undefined;
    return drawioBlob({
      name: `${s.brief.title} · ${name}`,
      sourceCredit: library ? creditText(library) : undefined,
      width,
      height,
      elements,
    });
  } finally {
    root.remove();
  }
}
