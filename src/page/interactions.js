// Notes what the user does (fill a field, click, press Enter), described with the page's own labels.
import { CLICKABLE, FIELD, fieldLabel, clickLabel, describe } from "../shared/dom.js";

const SKIPPED_TYPES = new Set(["password", "hidden", "file"]);

function fieldEvent(element) {
  const type = element.tagName === "SELECT" ? "select" : element.tagName === "TEXTAREA" ? "textarea" : (element.type || "text");
  if (SKIPPED_TYPES.has(type)) return null;
  const label = fieldLabel(element);
  if (!label) return null;
  return {
    kind: "field",
    key: `${label}::${element.name || element.id}`, // survives sites that swap the element while you type
    label,
    type,
    value: type === "checkbox" ? String(element.checked) : element.value,
    options: type === "select" ? [...element.options].map((o) => ({ value: o.value, label: o.text.trim() })) : undefined,
    display: type === "select" ? element.selectedOptions[0]?.text : undefined,
    target: describe(element, label),
    at: Date.now(),
  };
}

export function installInteractionCapture({ isRecording, onInteraction }) {
  const onField = (event) => {
    if (!isRecording() || !event.target.matches?.(FIELD)) return;
    const field = fieldEvent(event.target);
    if (field) onInteraction(field);
  };
  document.addEventListener("input", onField, true);
  document.addEventListener("change", onField, true);

  document.addEventListener("click", (event) => {
    const element = isRecording() && event.target.closest?.(CLICKABLE);
    const label = element && clickLabel(element);
    if (label) onInteraction({ kind: "click", label, target: describe(element, label), at: Date.now() });
  }, true);

  // Enter in a search box often submits without any button click.
  document.addEventListener("keydown", (event) => {
    if (!isRecording() || event.key !== "Enter" || !event.target.matches?.("input")) return;
    const field = fieldEvent(event.target);
    if (field) onInteraction({ kind: "enter", label: field.label, target: field.target, at: Date.now() });
  }, true);

  // Forms submitted another way: record their filled fields and the submit button's label.
  document.addEventListener("submit", (event) => {
    if (!isRecording()) return;
    for (const element of event.target.elements) {
      const field = element.matches(FIELD) && fieldEvent(element);
      if (field && field.value !== "") onInteraction(field);
    }
    const button = event.submitter || event.target.querySelector('[type="submit"]');
    if (button) onInteraction({ kind: "submit", label: clickLabel(button) || "Submit", target: describe(button, clickLabel(button)), at: Date.now() });
  }, true);
}
