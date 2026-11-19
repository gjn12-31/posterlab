import type { DrawioPage } from "./drawio";

export default function PaperArtworkView({
  page,
  className,
  label,
}: {
  page: DrawioPage;
  className: string;
  label: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${page.width} ${page.height}`}
      aria-label={label}
      role="img"
    >
      {page.elements.map((el, i) =>
        el.type === "rect" ? (
          <rect
            key={i}
            x={el.x}
            y={el.y}
            width={el.width}
            height={el.height}
            fill={el.fill}
          />
        ) : el.type === "image" ? (
          <image
            key={i}
            x={el.x}
            y={el.y}
            width={el.width}
            height={el.height}
            href={el.src}
            preserveAspectRatio="none"
          />
        ) : (
          <text
            key={i}
            x={el.x}
            y={el.y}
            fontSize={el.fontSize}
            fontWeight={el.bold ? 700 : 400}
            fill={el.color}
            fontFamily={
              'PosterCommon, PosterSans, "PingFang SC", Arial, sans-serif'
            }
            dominantBaseline="text-before-edge"
          >
            {el.text.split("\n").map((line, n) => (
              <tspan
                key={n}
                x={el.x}
                y={el.y + n * el.fontSize * (el.lineHeight || 1.22)}
              >
                {line}
              </tspan>
            ))}
          </text>
        ),
      )}
    </svg>
  );
}
