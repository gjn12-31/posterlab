import { useEffect, useRef, useState } from "react";

/** Run recorded previews only while visible. Manual scrubbing holds the selected frame. */
export function useDemoPlayback(
  count: number,
  duration: number,
  initial = 0,
  enabled = true,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initial);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(false);
  const [onScreen, setOnScreen] = useState(() => !document.hidden);
  const remaining = useRef(duration);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.18 },
    );
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      if (reduced.matches) setPlaying(false);
    };
    const updatePage = () => setOnScreen(!document.hidden);
    observer.observe(element);
    reduced.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updatePage);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updatePage);
    };
  }, []);

  const running = playing && visible && onScreen && enabled;
  useEffect(() => {
    remaining.current = duration;
  }, [index, cycle, duration]);
  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const timer = window.setTimeout(
      () => setIndex((n) => (n + 1) % count),
      remaining.current,
    );
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(
        1,
        remaining.current - (performance.now() - started),
      );
    };
  }, [running, index, count, duration, cycle]);

  function select(value: number) {
    setPlaying(false);
    setIndex((value + count) % count);
    setCycle((n) => n + 1);
  }
  function replay() {
    setIndex(0);
    setCycle((n) => n + 1);
    setPlaying(true);
  }
  return {
    viewport,
    index,
    running,
    playing,
    cycle,
    select,
    replay,
    toggle: () => setPlaying((p) => !p),
  };
}
