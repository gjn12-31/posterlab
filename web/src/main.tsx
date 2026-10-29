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
          background: "#0b0e16",
          color: "#ddd",
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
