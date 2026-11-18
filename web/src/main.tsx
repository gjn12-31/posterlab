import { lazy, Suspense, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
const Home = lazy(() => import("./StudioHome"));
const Campaign = lazy(() => import("./CampaignHome"));
const Paper = lazy(() => import("./PaperStudio"));
const Templates = lazy(() => import("./AtlasCreate"));
const Gallery = lazy(() => import("./DiscoveryHome"));
const Editor = lazy(() => import("./TemplateStudio"));
const Assistant = lazy(() => import("./Generator"));
function renderer() {
  if (new URLSearchParams(location.search).get("mode") === "templates")
    return "editor";
  if (
    /^#papers(?:\/(?:import|story|channels(?:\/(?:x|red|moments|wechat))?))?$/.test(
      location.hash,
    )
  )
    return "papers";
  if (location.hash === "#studio") return "ai";
  if (location.hash === "#create") return "templates";
  if (
    location.hash === "#campaign" ||
    location.hash === "#campaign/plan" ||
    location.hash === "#home" ||
    (!location.hash &&
      new URLSearchParams(location.search).get("view") === "campaign")
  )
    return "campaign";
  if (
    !location.hash ||
    location.hash.startsWith("#collection/") ||
    ["#desk", "#demo", "#workbench", "#collection", "#faq", "#about"].includes(location.hash)
  )
    return "desk";
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
      {module === "desk" ? (
        <Home />
      ) : module === "papers" ? (
        <Paper />
      ) : module === "editor" ? (
        <Editor />
      ) : module === "ai" ? (
        <Assistant />
      ) : module === "templates" ? (
        <Templates />
      ) : module === "campaign" ? (
        <Campaign />
      ) : (
        <Gallery />
      )}
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
