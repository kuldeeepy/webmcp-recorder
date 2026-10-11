// Run a task once: on the page (watch every step) or in the background (fast, page doesn't change).
import { h, nextId } from "../dom.js";
import { button, viewHeader, inputControl, resultCard, riskBadge, toast } from "../components.js";
import { canRunInBackground } from "../../shared/task-builder.js";

function modeChooser(task) {
  if (!canRunInBackground(task)) return h("p", { class: "hint" }, "Runs on the page, step by step, so you can watch it.");
  const name = nextId("mode");
  const option = (value, label, hint, checked) => {
    const id = nextId("mode");
    return h("div", { class: "check" },
      h("input", { type: "radio", name, id, value, checked }),
      h("label", { for: id }, label, h("span", { class: "muted block" }, hint)));
  };
  return h("fieldset", { class: "modes" },
    h("legend", {}, "Run"),
    option("page", "On the page", "Watch each step happen. Best for checking it works.", true),
    option("background", "In the background", "Much faster. The page updates when you refresh it.", false));
}

function progressList() {
  const list = h("ol", { class: "progress-steps", "aria-label": "Steps" });
  const rows = new Map();
  list.update = ({ index, label, status }) => {
    if (!rows.has(index)) rows.set(index, list.appendChild(h("li")));
    const row = rows.get(index);
    row.className = `${status} enter`;
    row.textContent = `${status === "done" ? "✓" : "…"} ${label}`;
  };
  return list;
}

export function runView({ task }, actions) {
  const inputs = task.inputs.filter((i) => i.enabled);
  const output = h("div", { class: "output stack", "aria-live": "polite" });
  const submit = h("button", { type: "submit", class: "button primary" }, "Run");

  async function onSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    const onPage = form.get(event.target.querySelector("[type=radio]")?.name) !== "background";
    form.forEach((_, key) => key.startsWith("mode-") && form.delete(key));
    const values = Object.fromEntries([...form].filter(([key]) => inputs.some((i) => i.id === key)));

    const steps = progressList();
    let fixCard = null;
    // A step whose element moved: ask the person to point at it on the page.
    const onProgress = (progress) => {
      if (progress.status === "needs-fix") {
        fixCard = h("div", { class: "card fix-card", role: "alert" },
          h("p", { class: "fix-title" }, h("span", { class: "fix-dot", "aria-hidden": "true" }), `Where's “${progress.label}” now?`),
          h("p", { class: "muted" }, `The page has changed. Click the ${progress.kind === "field" ? "field" : "button"} on the page and we'll remember it for next time.`),
          button("Cancel", actions.cancelFix, { variant: "text" }));
        output.prepend(fixCard);
        fixCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else if (progress.status === "fixed") {
        fixCard?.remove();
        toast("Fixed. We'll remember where it is now.");
      } else steps.update(progress);
    };
    output.replaceChildren(onPage ? steps : h("p", { class: "muted" }, "Sending…"));
    submit.disabled = true;
    submit.textContent = "Running…";
    const result = await actions.runTask(task, values, { onPage, onProgress });
    fixCard?.remove();
    output.replaceChildren(...(onPage ? [steps] : []), resultCard(result));
    submit.disabled = false;
    submit.textContent = "Run again";
  }

  return h("main", { class: "view" },
    viewHeader(task.title, { onBack: actions.goHome }),
    h("p", { class: "row" }, riskBadge(task.risky), h("span", { class: "muted" }, task.host)),
    h("form", { class: "stack card", onSubmit },
      inputs.length > 0 && h("p", { class: "form-note hint" }, "Filled in from your recording. Change what you need.",
        button("Clear all", (e) => e.target.form.querySelectorAll("input:not([type=radio]), textarea").forEach((field) => { field.value = ""; }), { variant: "text" })),
      inputs.length ? inputs.map((input) => inputControl(input, input.example)) : h("p", { class: "muted" }, "This task has no inputs. It repeats exactly what you did."),
      modeChooser(task),
      h("div", { class: "row" }, submit, button("Run from a spreadsheet", () => actions.openBulk(task), { variant: "text" }))),
    output);
}
