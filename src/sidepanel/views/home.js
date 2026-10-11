// The task list for the current site, plus "Teach a new task" and team sharing.
import { h } from "../dom.js";
import { button, riskBadge, emptyState } from "../components.js";
import { dotLogo } from "../dot-logo.js";

const MAX_CHIPS = 4;

function fieldChips(task) {
  const labels = task.inputs.filter((i) => i.enabled).map((i) => i.label);
  if (!labels.length) return h("p", { class: "muted small" }, "No inputs: repeats exactly what you did");
  const shown = labels.slice(0, MAX_CHIPS);
  return h("p", { class: "chips", "aria-label": `Asks for ${labels.join(", ")}` },
    shown.map((label) => h("span", { class: "chip" }, label)),
    labels.length > MAX_CHIPS && h("span", { class: "chip more" }, `+${labels.length - MAX_CHIPS}`));
}

function timeAgo(at) {
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : new Date(at).toLocaleDateString();
}

function lastRun(run) {
  if (!run) return h("p", { class: "last-run idle" }, h("span", { class: "status-dot", "aria-hidden": "true" }), "Not run yet");
  return h("p", { class: `last-run ${run.ok ? "ok" : run.partial ? "partial" : "error"}`, title: run.message },
    h("span", { class: "status-dot", "aria-hidden": "true" }), `${timeAgo(run.at)} · ${run.message}`);
}

// Edit and Delete live in a small menu so each card has one clear action.
function moreMenu(task, titleId, actions) {
  return h("details", { class: "menu" },
    h("summary", { class: "button text icon", "aria-label": "More actions", "aria-describedby": titleId }, "⋯"),
    h("div", { class: "menu-items", role: "group" },
      button("Edit task", () => actions.editTask(task), { variant: "text" }),
      button("Delete task", () => actions.deleteTask(task), { variant: "text danger" })));
}

function taskCard(task, run, actions, index) {
  const titleId = `task-${task.id}`;
  return h("li", { class: "card task enter", style: `--i:${index}`, "aria-labelledby": titleId },
    h("div", { class: "task-head" }, h("h3", { id: titleId }, task.title), riskBadge(task.risky)),
    fieldChips(task),
    lastRun(run),
    h("div", { class: "task-actions" },
      button("▶ Run", () => actions.openRun(task), { variant: "primary", "aria-describedby": titleId }),
      button("Spreadsheet", () => actions.openBulk(task), { "aria-describedby": titleId }),
      moreMenu(task, titleId, actions)));
}

function shareFooter(site, actions) {
  const picker = h("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: (e) => e.target.files[0] && actions.importTasks(e.target.files[0]) });
  return h("footer", { class: "share" },
    h("p", { class: "muted small" }, "Share tasks with your team as a file."),
    h("div", { class: "row" },
      site.tasks.length > 0 && button("Export", actions.exportTasks, { variant: "text" }),
      button("Import", () => picker.click(), { variant: "text" }),
      picker),
    h("p", { class: "hint", id: "share-status", role: "status" }));
}

const howItWorks = () => h("ol", { class: "steps-intro" },
  h("li", {}, h("strong", {}, "Teach. "), "Click the button below, then do the task on this site as you normally would."),
  h("li", {}, h("strong", {}, "Check. "), "We show what we understood: the steps and the fields it asks for."),
  h("li", {}, h("strong", {}, "Reuse. "), "Run it again in one click, for every row of a spreadsheet, or let an AI agent run it."));

export function homeView({ site }, actions) {
  const hasTasks = site.tasks.length > 0;
  const teach = button(hasTasks ? "+ Teach a new task" : "Teach a new task", actions.startRecording, { variant: hasTasks ? "secondary wide" : "primary wide" });
  return h("main", { class: "view" },
    h("header", { class: "view-header" },
      h("p", { class: "eyebrow" }, hasTasks ? `Your tasks on` : "Getting started on"),
      h("h1", { class: "view-title", tabindex: "-1" }, site.host)),
    hasTasks
      ? [h("ul", { class: "task-list", "aria-label": "Saved tasks" }, site.tasks.map((t, i) => taskCard(t, site.runs?.[t.id], actions, i))), teach]
      : [h("div", { class: "logo-wrap" }, dotLogo()), emptyState("Automate something you do here", howItWorks(), teach)],
    shareFooter(site, actions));
}
