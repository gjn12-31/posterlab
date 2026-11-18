import { lazy, Suspense, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
const Gallery = lazy(() => import("./DiscoveryHome"));
const Editor = lazy(() => import("./TemplateStudio"));
const Assistant = lazy(() => import("./Generator"));
function renderer() {
  if (new URLSearchParams(location.search).get("mode") === "templates")
    return "editor";
  if (location.hash === "#studio") return "ai";
  return "gallery";
}
function subscribe(notify: () => void) {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
}
function App() {
  const module = useSyncExternalStore(subscribe, renderer);
  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: 32,
            background: "#f6f4ec",
            color: "#21211e",
            minHeight: "100dvh",
            fontFamily: "system-ui",
          }}
        >
          正在打开 PosterLab…
        </div>
      }
    >
      {module === "editor" ? (
        <Editor />
      ) : module === "ai" ? (
        <Assistant />
      ) : (
        <Gallery />
      )}
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
