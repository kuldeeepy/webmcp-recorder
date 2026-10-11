// Shared building blocks for the side panel views.
import { h, nextId } from "./dom.js";

export const button = (label, onClick, { variant = "secondary", ...props } = {}) =>
  h("button", { type: "button", class: `button ${variant}`, onClick, ...props }, label);

export const viewHeader = (title, { onBack, subtitle } = {}) =>
  h("header", { class: "view-header" },
    onBack && button("← Back", onBack, { variant: "text", "aria-label": "Back to tasks" }),
    h("h1", { class: "view-title", tabindex: "-1" }, title),
    subtitle && h("p", { class: "muted" }, subtitle));

export const riskBadge = (risky) =>
  h("span", { class: `badge ${risky ? "badge-warn" : "badge-safe"}` }, risky ? "Changes data" : "Read-only");

export function resultCard(result) {
  return h("div", { class: `result ${result.ok ? "result-ok" : "result-error"}`, role: "status" },
    h("p", { class: "result-message" }, h("span", { "aria-hidden": "true" }, result.ok ? "✓ " : "✕ "), result.message),
    result.body && h("details", {}, h("summary", {}, "Show what the site sent back"), h("pre", {}, result.body.slice(0, 4000))));
}

// One form control for a task input, using the site's own label and field type.
export function inputControl(input, value) {
  const id = nextId("input");
  const control = input.type === "select" && input.options?.length
    ? h("select", { id, name: input.id }, input.options.map((o) => h("option", { value: o.value, selected: String(o.value) === String(value) }, o.label || o.value)))
    : input.type === "textarea"
      ? h("textarea", { id, name: input.id, rows: "3", value: String(value ?? "") })
      : h("input", { id, name: input.id, type: ["number", "date", "email", "tel", "url"].includes(input.type) ? input.type : "text", value: String(value ?? ""), step: input.type === "number" ? "any" : null });
  return h("div", { class: "field" }, h("label", { for: id }, input.label), control);
}

export function emptyState(title, body, action) {
  return h("section", { class: "empty" }, h("h2", {}, title), body, action);
}

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A short notification at the bottom of the panel.
export function toast(message) {
  const note = h("div", { class: "toast", role: "status" }, message);
  document.body.append(note);
  setTimeout(() => note.classList.add("leaving"), 2600);
  setTimeout(() => note.remove(), 3000);
}

// Counts a number up from zero, e.g. "You saved ~37 min".
export function countUp(element, to, format = (n) => String(n), duration = 900) {
  if (reducedMotion()) return (element.textContent = format(to));
  const start = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - start) / duration);
    element.textContent = format(Math.round(to * (1 - (1 - t) ** 3)));
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
