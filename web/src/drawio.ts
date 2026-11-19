/** Portable, uncompressed diagrams.net documents. Coordinates are poster pixels. */
type ObjectBounds = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  layer?: string;
};

export type DrawioElement = ObjectBounds &
  (
    | {
        type: "text";
        text: string;
        fontSize: number;
        color: string;
        fontFamily?: string;
        bold?: boolean;
        italic?: boolean;
        align?: "left" | "center" | "right";
        verticalAlign?: "top" | "middle" | "bottom";
        lineHeight?: number;
      }
    | { type: "image"; src: string }
    | {
        type: "rect";
        fill: string;
        stroke?: string;
        strokeWidth?: number;
        gradient?: string;
        gradientDirection?: "north" | "south" | "east" | "west";
        rounded?: boolean;
      }
  );

export type DrawioPage = {
  name: string;
  sourceCredit?: string;
  width: number;
  height: number;
  background?: string;
  elements: DrawioElement[];
};

function xml(value: string): string {
  return value
    .replace(
      /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
      "",
    )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replace(/\r\n?|\n/g, "&#10;")
    .replaceAll("\t", "&#9;");
}

function number(value: number, minimum = -Infinity): number {
  if (!Number.isFinite(value) || value < minimum)
    throw Error("海报图层的尺寸或坐标无效。");
  return Math.round(value * 1000) / 1000;
}

function paint(value: string): string {
  if (
    /^(?:#[a-f0-9]{3}|#[a-f0-9]{6}|none|transparent|black|white)$/i.test(value)
  )
    return value === "transparent" ? "none" : value;
  throw Error("海报图层含有无效颜色。");
}

function encodeObject(
  item: DrawioElement,
  index: number,
  layerId: string,
): string {
  let label = "";
  let style: string;
  if (item.type === "text") {
    // Escape user text before inserting our optional native rich-text container.
    // mxCodec then decodes the outer XML attribute before diagrams.net edits it.
    const rich = item.lineHeight !== undefined;
    if (rich) {
      const leading = number(item.lineHeight!, 0.1);
      const body = item.text
        .split(/\r\n?|\n/)
        .map(xml)
        .join("<br>");
      label = '<div style="line-height:' + leading + '">' + body + "</div>";
    } else label = item.text;
    const family = (item.fontFamily || "sans-serif").replace(
      /[^\p{L}\p{N} ,_'-]/gu,
      "",
    );
    style = [
      "text",
      "html=" + (rich ? 1 : 0),
      "whiteSpace=nowrap",
      "spacing=0",
      "overflow=visible",
      "strokeColor=none",
      "fillColor=none",
      "align=" + (item.align || "left"),
      "verticalAlign=" + (item.verticalAlign || "top"),
      "fontFamily=" + family,
      "fontSize=" + number(item.fontSize, 0.1),
      "fontColor=" + paint(item.color),
      "fontStyle=" + ((item.bold ? 1 : 0) + (item.italic ? 2 : 0)),
    ].join(";");
  } else if (item.type === "image") {
    // In mxGraph styles ';' separates properties. mxGraph.getImage restores
    // the ';base64' marker when reading this embedded-image representation.
    const asset =
      /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/]+={0,2})$/i.exec(
        item.src,
      );
    if (!asset) throw Error("请使用已嵌入的 PNG、JPEG 或 WebP 图片。");
    style =
      "shape=image;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;image=data:image/" +
      asset[1] +
      "," +
      asset[2];
  } else {
    style =
      "shape=rectangle;rounded=" +
      (item.rounded ? 1 : 0) +
      ";fillColor=" +
      paint(item.fill) +
      ";strokeColor=" +
      paint(item.stroke || "none") +
      ";strokeWidth=" +
      number(item.strokeWidth ?? 1, 0);
    if (item.gradient)
      style +=
        ";gradientColor=" +
        paint(item.gradient) +
        ";gradientDirection=" +
        (item.gradientDirection || "south");
  }
  if (item.rotation) style += ";rotation=" + number(item.rotation);
  if (item.opacity !== undefined)
    style += ";opacity=" + Math.min(100, number(item.opacity, 0));
  const geometry =
    '<mxGeometry x="' +
    number(item.x) +
    '" y="' +
    number(item.y) +
    '" width="' +
    number(item.width, 0) +
    '" height="' +
    number(item.height, 0) +
    '" as="geometry"/>';
  return (
    '<UserObject id="element-' +
    index +
    '" label="' +
    xml(label) +
    '" name="' +
    xml(item.name) +
    '">' +
    '<mxCell vertex="1" parent="' +
    layerId +
    '" style="' +
    xml(style + ";") +
    '">' +
    geometry +
    "</mxCell></UserObject>"
  );
}

export function drawioXml(page: DrawioPage): string {
  const width = number(page.width, 1);
  const height = number(page.height, 1);
  const cells = ['<mxCell id="0"/>'];
  let previous: string | undefined;
  let layerId = "";
  for (const [index, item] of page.elements.entries()) {
    const layer = item.layer || "海报";
    if (layer !== previous) {
      layerId = "layer-" + index;
      cells.push(
        '<mxCell id="' + layerId + '" value="' + xml(layer) + '" parent="0"/>',
      );
      previous = layer;
    }
    cells.push(encodeObject(item, index, layerId));
  }
  if (!page.elements.length)
    cells.push('<mxCell id="layer-0" value="海报" parent="0"/>');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" type="device" compressed="false">' +
    '<diagram id="poster" name="' +
    xml(page.name) +
    (page.sourceCredit ? '" sourceCredit="' + xml(page.sourceCredit) : "") +
    '"><mxGraphModel grid="0" guides="1" page="1" pageScale="1"' +
    ' pageWidth="' +
    width +
    '" pageHeight="' +
    height +
    '" background="' +
    paint(page.background || "#ffffff") +
    '">' +
    "<root>" +
    cells.join("") +
    "</root></mxGraphModel></diagram></mxfile>"
  );
}

export function drawioBlob(page: DrawioPage): Blob {
  return new Blob([drawioXml(page)], { type: "application/xml;charset=utf-8" });
}
