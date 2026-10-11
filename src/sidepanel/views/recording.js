// Live list of what we've noticed while the user does the task.
import { h } from "../dom.js";
import { button } from "../components.js";

const MAX_SHOWN = 12;
const shown = new Set(); // steps already on screen don't animate again when the list redraws

const shorten = (text, max = 40) => (String(text).length > max ? `${String(text).slice(0, max)}…` : String(text));

function describe(step) {
  if (step.kind === "field") return step.type === "select" ? `Chose “${shorten(step.display)}” in ${step.label}` : `Filled in ${step.label}: ${shorten(step.value)}`;
  if (step.kind === "enter") return `Pressed Enter in ${step.label}`;
  if (step.kind === "click" || step.kind === "submit") return `Clicked “${step.label}”`;
  return `Site received data (${step.method} ${step.path})`;
}

export function recordingView({ site }, actions) {
  const { interactions, requests } = site.recording;
  const steps = [...interactions, ...requests.filter((r) => r.method !== "GET").map((r) => ({ ...r, kind: "request" }))]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_SHOWN);

  return h("main", { class: "view" },
    h("header", { class: "view-header" },
      h("p", { class: "recording-pill" }, h("span", { class: "dot", "aria-hidden": "true" }), "Recording"),
      h("h1", { class: "view-title", tabindex: "-1" }, "Do the task now"),
      h("p", { class: "muted" }, `Use ${site.host} as you normally would. Fill in the form and press its save or submit button. Passwords are never recorded.`)),
    h("ol", { class: "timeline", "aria-live": "polite", "aria-label": "What we noticed" },
      steps.length ? steps.map((s) => {
        const key = `${s.kind}:${s.key ?? s.label ?? s.path}:${s.at}`;
        const fresh = !shown.has(key);
        shown.add(key);
        return h("li", { class: `${s.kind === "request" ? "is-request" : ""} ${fresh ? "enter" : ""}` }, describe(s));
      }) : h("li", { class: "muted" }, "Waiting for your first action…")),
    h("div", { class: "row sticky-actions" },
      button("I'm done", actions.stopRecording, { variant: "primary" }),
      button("Cancel", actions.cancelRecording)),
    h("p", { class: "hint" }, "Clicked something by mistake? You can leave it out on the next screen."));
}
