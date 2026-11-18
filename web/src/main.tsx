import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
const Studio = lazy(() =>
  new URLSearchParams(location.search).get("mode") === "templates"
    ? import("./TemplateStudio")
    : import("./Generator"),
);
createRoot(document.getElementById("root")!).render(
  <Suspense
    fallback={
      <div
        style={{
          padding: 40,
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f4",
          color: "#272821",
          minHeight: "100vh",
        }}
      >
        正在打开 PosterLab…
      </div>
    }
  >
    <Studio />
  </Suspense>,
);
