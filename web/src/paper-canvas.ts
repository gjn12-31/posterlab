import type { DrawioElement } from "./drawio";

export type PaperRect = { x: number; y: number; w: number; h: number };

/** Paint each object once in poster coordinates. Source export additionally
 * records the editable cell at the position used by the PNG renderer. */
export class PaperCanvas {
  readonly elements: DrawioElement[] = [];
  layer = "主视觉";

  constructor(
    readonly g: CanvasRenderingContext2D,
    readonly editable = false,
  ) {}

  private geometry(r: PaperRect) {
    const t = this.g.getTransform();
    const width = Math.hypot(t.a, t.b) * r.w;
    const height = Math.hypot(t.c, t.d) * r.h;
    const center = t.transformPoint(new DOMPoint(r.x + r.w / 2, r.y + r.h / 2));
    return {
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      rotation: (Math.atan2(t.b, t.a) * 180) / Math.PI,
    };
  }

  rect(
    name: string,
    rect: PaperRect,
    fill: string,
    stroke?: string,
    strokeWidth = 1,
  ) {
    const { g } = this;
    g.fillStyle = fill;
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = strokeWidth;
      g.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
    if (this.editable)
      this.elements.push({
        type: "rect",
        name,
        layer: this.layer,
        ...this.geometry(rect),
        fill,
        stroke,
        strokeWidth,
      });
  }

  text(
    name: string,
    lines: string[],
    x: number,
    y: number,
    width: number,
    step: number,
    fitWidth = false,
  ) {
    const { g } = this;
    lines.forEach((line, i) =>
      g.fillText(line, x, y + step * i, fitWidth ? width : undefined),
    );
    if (!this.editable || !lines.length) return;
    const font = g.font.match(/([\d.]+)px\s+(.+)/);
    if (!font) throw Error("海报字体无法导出。");
    const size = Number(font[1]),
      bold = /(?:bold|[6-9]00)/.test(g.font.split(size + "px")[0]);
    // PosterCommon/PosterSans are packaged webfonts. Give diagrams.net a CJK
    // fallback on desktop machines where those private families are absent.
    const fontFamily = font[2].includes("Poster")
      ? "Noto Sans CJK SC, PingFang SC, Microsoft YaHei, Arial, sans-serif"
      : "Arial, Helvetica, sans-serif";
    const align =
      g.textAlign === "right" || g.textAlign === "center"
        ? g.textAlign
        : "left";
    const startX =
      x - (align === "right" ? width : align === "center" ? width / 2 : 0);
    const top =
      y -
      (g.textBaseline === "alphabetic"
        ? g.measureText("Hg").fontBoundingBoxAscent
        : 0);
    const maxTextWidth = fitWidth
      ? Math.max(...lines.map((line) => g.measureText(line).width))
      : 0;
    const sourceSize =
      maxTextWidth > width ? (size * width) / maxTextWidth : size;
    this.elements.push({
      type: "text",
      name,
      layer: this.layer,
      ...this.geometry({
        x: startX,
        y: top,
        w: width,
        h: Math.max(step * lines.length, size * 1.17),
      }),
      text: lines.join("\n"),
      fontSize: sourceSize,
      fontFamily,
      bold,
      align,
      verticalAlign: "top",
      lineHeight: step / sourceSize,
      color: String(g.fillStyle),
    });
  }

  image(
    name: string,
    image: HTMLImageElement,
    source: string,
    rect: PaperRect,
  ) {
    this.g.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    if (this.editable)
      this.elements.push({
        type: "image",
        name,
        layer: this.layer,
        ...this.geometry(rect),
        src: source,
      });
  }

  /** An isolated background/crop with no text. Transparency is retained for
   * shading so the underlying photograph can still be moved or replaced. */
  artwork(
    name: string,
    rect: PaperRect,
    paint: (ctx: CanvasRenderingContext2D) => void,
  ) {
    paint(this.g);
    if (!this.editable) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(rect.w));
    canvas.height = Math.max(1, Math.ceil(rect.h));
    const ctx = canvas.getContext("2d")!;
    ctx.scale(canvas.width / rect.w, canvas.height / rect.h);
    ctx.translate(-rect.x, -rect.y);
    paint(ctx);
    this.elements.push({
      type: "image",
      name,
      layer: this.layer,
      ...this.geometry(rect),
      src: canvas.toDataURL("image/png"),
    });
  }
}
