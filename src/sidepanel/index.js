// Side panel app: tracks the active tab, holds the current view, and renders it.
import { Msg } from "../shared/messages.js";
import { h } from "./dom.js";
import { button, emptyState, toast, reducedMotion } from "./components.js";
import { currentTabId, sendToTab, onTabState, runOnPage, PageNotReadyError } from "./tab.js";
import { homeView } from "./views/home.js";
import { recordingView } from "./views/recording.js";
import { reviewView } from "./views/review.js";
import { runView } from "./views/run.js";
import { bulkView } from "./views/bulk.js";
import { exportTasks, readTaskFile } from "./share.js";

const root = document.getElementById("app");
const views = { home: homeView, recording: recordingView, review: reviewView, run: runView, bulk: bulkView };
// Views with their own form state are not redrawn by background updates.
const LIVE_VIEWS = new Set(["home", "recording"]);

const app = { tabId: null, status: "loading", site: null, view: { name: "home" } };

function render() {
  if (app.status === "loading") return root.replaceChildren(h("p", { class: "view muted", role: "status" }, "Loading…"));
  if (app.status === "not-ready") {
    return root.replaceChildren(h("main", { class: "view" }, emptyState("Refresh this page to start",
      h("p", { class: "muted" }, "WebMCP Recorder starts working on a page once it's loaded with the extension on. Chrome's own pages (like chrome://) can't be recorded."),
      button("Refresh page", () => chrome.tabs.reload(app.tabId), { variant: "primary" }))));
  }
  root.replaceChildren(views[app.view.name]({ ...app.view, site: app.site }, actions));
}

function navigate(view) {
  app.view = view;
  const show = () => {
    render();
    root.querySelector(".view-title")?.focus(); // move screen readers to the new view
  };
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(show);
  else show();
}

async function loadTab() {
  const previousStatus = app.status;
  app.tabId = await currentTabId();
  try {
    app.site = await sendToTab(app.tabId, Msg.GET_STATE);
    app.status = "ready";
    if (app.site.recording.active) app.view = { name: "recording" };
    else if (!["review", "run", "bulk"].includes(app.view.name)) app.view = { name: "home" };
  } catch (error) {
    // Chrome pages, the Web Store and closed tabs can't be reached; all mean "can't work here yet".
    if (!(error instanceof PageNotReadyError)) console.warn("[WebMCP Recorder]", error.message);
    app.status = "not-ready";
  }
  // A run that navigates the page must not wipe the run screen's progress.
  if (app.status !== previousStatus || LIVE_VIEWS.has(app.view.name)) render();
}

const call = (type, payload) => sendToTab(app.tabId, type, payload);

const actions = {
  goHome: () => navigate({ name: "home" }),
  openRun: (task) => navigate({ name: "run", task }),
  openBulk: (task) => navigate({ name: "bulk", task }),
  // onPage: replay the steps visibly; otherwise send the recorded request in the background.
  runTask: (task, values, { onPage = false, onProgress, quick = false } = {}) =>
    onPage ? runOnPage(app.tabId, task.id, values, onProgress, quick) : call(Msg.RUN_TASK, { taskId: task.id, values, record: !quick }),
  recordRun: (task, result) => call(Msg.RECORD_RUN, { taskId: task.id, result }),
  cancelFix: () => call(Msg.CANCEL_FIX),

  async startRecording() {
    app.site = await call(Msg.START_RECORDING);
    navigate({ name: "recording" });
  },
  async stopRecording() {
    const review = await call(Msg.STOP_RECORDING);
    navigate({ name: "review", review });
  },
  async cancelRecording() {
    app.site = await call(Msg.CANCEL_RECORDING);
    navigate({ name: "home" });
  },
  async pickRequest(index) {
    const draft = await call(Msg.DRAFT_FROM_REQUEST, { index });
    navigate({ name: "review", review: { ...app.view.review, draft } });
  },
  async saveDraft(draft) {
    const editing = app.view.review?.editing;
    const task = await call(Msg.SAVE_TASK, { task: draft });
    navigate({ name: "run", task });
    toast(editing ? "Changes saved." : `Saved “${task.title}”. Try it with new values.`);
  },
  async discardDraft() {
    if (!app.view.review?.editing) app.site = await call(Msg.CANCEL_RECORDING);
    navigate({ name: "home" });
  },
  editTask: (task) => navigate({ name: "review", review: { draft: structuredClone(task), requests: [], editing: true } }),
  exportTasks: () => exportTasks(app.site),
  async importTasks(file) {
    const say = (text) => { const status = root.querySelector("#share-status"); if (status) status.textContent = text; };
    try {
      const imported = await readTaskFile(file, app.site.host);
      app.site = await call(Msg.IMPORT_TASKS, { imported });
      render();
      say(`Imported ${imported.length} task${imported.length === 1 ? "" : "s"}.`);
    } catch (error) {
      say(error.message);
    }
  },
  async deleteTask(task) {
    if (!confirmDelete(task)) return;
    app.site = await call(Msg.DELETE_TASK, { id: task.id });
    navigate({ name: "home" });
    toast(`Deleted “${task.title}”.`);
  },
};

// Deleting asks twice via the button itself (no blocking browser dialogs).
const armed = new Set();
function confirmDelete(task) {
  if (armed.has(task.id)) return armed.delete(task.id), true;
  armed.add(task.id);
  const card = [...root.querySelectorAll(".task")].find((el) => el.getAttribute("aria-labelledby") === `task-${task.id}`);
  const deleteButton = card?.querySelector(".danger");
  if (deleteButton) deleteButton.textContent = "Click again to delete";
  setTimeout(() => armed.delete(task.id), 4000);
  return false;
}

onTabState((tabId, state) => {
  if (tabId !== app.tabId) return;
  app.site = state;
  if (LIVE_VIEWS.has(app.view.name)) render();
});

chrome.tabs.onActivated.addListener(() => !new URLSearchParams(location.search).has("tab") && loadTab());
chrome.tabs.onUpdated.addListener((tabId, info) => tabId === app.tabId && info.status === "complete" && loadTab());

render();
loadTab();
