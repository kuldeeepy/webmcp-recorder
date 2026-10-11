// When a step can't find its element, the person points at it on the page and the task remembers.
import { CLICKABLE, FIELD, isVisible } from "../shared/dom.js";

const Z = 2147483647;
const ACCENT = "#1a73e8";
const POINT_TIMEOUT_MS = 120_000;
let cancelPointing = null;

export const cancelPoint = () => cancelPointing?.();

// Resolves with the element the person clicks (of the right kind), or null on Escape / cancel / timeout.
export function pointAt(step) {
  const pool = step.kind === "field" ? FIELD : `${CLICKABLE}, [onclick], [role="link"]`;
  const outline = document.createElement("div");
  const banner = document.createElement("div");
  outline.setAttribute("aria-hidden", "true");
  outline.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};border:2px solid ${ACCENT};border-radius:6px;
    background:rgba(26,115,232,.08);transition:all .12s ease-out;display:none`;
  banner.setAttribute("role", "status");
  banner.textContent = `Click the ${step.kind === "field" ? "field" : "button"} for “${step.label}” · Esc to cancel`;
  banner.style.cssText = `position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:${Z};pointer-events:none;
    background:#202124;color:#fff;font:500 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25)`;
  document.documentElement.append(outline, banner);

  const candidate = (target) => {
    const element = target?.closest?.(pool);
    return element && isVisible(element) && !banner.contains(element) ? element : null;
  };

  return new Promise((resolve) => {
    const finish = (element) => {
      removeEventListener("mousemove", onMove, true);
      removeEventListener("click", onClick, true);
      removeEventListener("keydown", onKey, true);
      clearTimeout(timer);
      outline.remove();
      banner.remove();
      cancelPointing = null;
      resolve(element);
    };
    const onMove = (event) => {
      const element = candidate(event.target);
      if (!element) return (outline.style.display = "none");
      const box = element.getBoundingClientRect();
      Object.assign(outline.style, { display: "block", left: `${box.left - 3}px`, top: `${box.top - 3}px`, width: `${box.width + 6}px`, height: `${box.height + 6}px` });
    };
    const onClick = (event) => {
      const element = candidate(event.target);
      if (!element) return;
      event.preventDefault();
      event.stopImmediatePropagation(); // the run performs the click itself, once
      finish(element);
    };
    const onKey = (event) => event.key === "Escape" && finish(null);
    const timer = setTimeout(() => finish(null), POINT_TIMEOUT_MS);
    cancelPointing = () => finish(null);
    addEventListener("mousemove", onMove, true);
    addEventListener("click", onClick, true);
    addEventListener("keydown", onKey, true);
  });
}
