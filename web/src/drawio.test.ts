import { describe, it, expect } from "vitest";
import { drawioXml, type DrawioPage } from "./drawio";

const frame = { x: 10.25, y: 30, width: 280, height: 60, name: "标题" };
const doc: DrawioPage = {
  name: 'Poster & "proof"',
  width: 1080,
  height: 1440,
  elements: [
    {
      ...frame,
      layer: "文案",
      type: "text",
      text: '试印 "A" & B\n<第二行>',
      color: "#222",
      fontSize: 36,
      bold: true,
    },
    {
      ...frame,
      layer: "文案",
      type: "text",
      text: "<img src=x>\n作者",
      lineHeight: 1.2,
      color: "#123456",
      fontSize: 16,
    },
    {
      ...frame,
      name: "原图",
      type: "image",
      src: "data:image/png;base64,iVBORw==",
      layer: "原图",
    },
  ],
};

describe("diagrams.net native poster export", () => {
  it("keeps page geometry, editable layers, original text, and embedded images", () => {
    const xml = drawioXml(doc);
    expect(xml).toContain('name="Poster &amp; &quot;proof&quot;"');
    expect(xml).toContain('pageWidth="1080" pageHeight="1440"');
    expect(xml.match(/parent="0"/g)).toHaveLength(2);
    expect(xml.match(/vertex="1"/g)).toHaveLength(3);
    expect(xml).toContain("试印 &quot;A&quot; &amp; B&#10;&lt;第二行&gt;");
    expect(xml).toContain("&amp;lt;img src=x&amp;gt;&lt;br&gt;");
    expect(xml).toContain("image=data:image/png,iVBORw==;");
    expect(xml).toContain('x="10.25"');
  });
  it("rejects external media, invalid coordinates, and style injection", () => {
    expect(() =>
      drawioXml({
        ...doc,
        elements: [
          { ...frame, type: "image", src: "https://example.org/p.png" },
        ],
      }),
    ).toThrow();
    expect(() => drawioXml({ ...doc, width: NaN })).toThrow();
    expect(() =>
      drawioXml({
        ...doc,
        elements: [
          { ...frame, type: "rect", fill: "red;link=https://example.org" },
        ],
      }),
    ).toThrow();
    expect(drawioXml({ ...doc, elements: [] })).toContain('id="layer-0"');
  });
});
