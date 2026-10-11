// Content-script entry: owns this site's tasks, the recording session and on-page runs; answers the side panel.
import { Msg, PageMsg } from "../shared/messages.js";
import { buildDraft } from "../shared/task-builder.js";
import { summarizeResponse } from "../shared/result.js";
import { loadSite, saveTasks, saveSession, saveRuns, emptySession } from "./storage.js";
import { toPage, onPageMessage, runInPage } from "./page-bridge.js";
import { runSteps, pendingRun, clearPendingRun, StepError } from "./ui-replay.js";
import { isVisible } from "../shared/dom.js";
import { cancelPoint } from "./point-to-fix.js";

const MAX_EVENTS = 60;
const host = location.host;
let tasks = [];
let session = emptySession();
let runs = {};
let runRequests = null; // requests seen during an on-page run, used to report what the site said

const publicState = () => ({ host, tasks, runs, recording: { active: session.active, interactions: session.interactions, requests: session.requests.map(summarizeRequest) } });

function summarizeRequest({ method, url, status, at }) {
  const { host: requestHost, pathname } = new URL(url);
  return { method, host: requestHost, path: pathname, status, at };
}

const notify = (message) => chrome.runtime.sendMessage(message).catch(() => {}); // the panel may be closed
const notifyPanel = () => notify({ type: Msg.STATE_CHANGED, state: publicState() });
const setCapturing = () => toPage(PageMsg.SET_CAPTURING, { interactions: session.active, requests: session.active || runRequests !== null });

function syncPage() {
  toPage(PageMsg.SET_TASKS, tasks);
  notify({ type: Msg.SET_BADGE, count: tasks.length });
}

// Typing updates memory and the panel at once but is saved after a pause; anything that may leave the page is saved now.
const TYPING_SAVE_DELAY_MS = 400;
let pendingSave = null;

async function updateSession(change, { soon = false } = {}) {
  session = { ...session, ...change };
  setCapturing();
  notifyPanel();
  clearTimeout(pendingSave);
  if (soon) pendingSave = setTimeout(() => saveSession(host, session), TYPING_SAVE_DELAY_MS);
  else await saveSession(host, session);
}

async function updateTasks(next) {
  tasks = next;
  await saveTasks(host, tasks);
  syncPage();
  notifyPanel();
}

onPageMessage((type, data) => {
  if (type === PageMsg.RUN_STEPS) return runForAgent(data);
  if (type === PageMsg.REQUEST && runRequests) runRequests.push(data);
  if (!session.active) return;
  if (type === PageMsg.INTERACTION) {
    const samePress = (e) => (e.kind === "click" || e.kind === "enter") && data.at - e.at < 2000;
    if (data.kind === "submit" && session.interactions.some(samePress)) return; // a click or Enter that submits fires both events
    // Typing fires one event per key: keep the latest value, but in the place the field was first touched.
    const sameField = (e) => data.kind === "field" && e.kind === "field" && e.key === data.key;
    const first = session.interactions.find(sameField);
    const event = first ? { ...data, at: first.at } : data;
    updateSession({ interactions: [...session.interactions.filter((e) => !sameField(e)), event].sort((a, b) => a.at - b.at).slice(-MAX_EVENTS) }, { soon: data.kind === "field" });
  }
  if (type === PageMsg.REQUEST) updateSession({ requests: [...session.requests, data].slice(-MAX_EVENTS) });
});

async function recordRun(taskId, result) {
  if (!result || !tasks.some((t) => t.id === taskId)) return;
  runs = { ...runs, [taskId]: { at: Date.now(), ok: result.ok, partial: !!result.partial, message: result.message } };
  await saveRuns(host, runs);
  notifyPanel();
}

// ---- On-page runs ----

const ERROR_SELECTOR = '[role="alert"], .alert-danger, .error, .invalid-feedback, .field-error';
const SUCCESS_SELECTOR = '[role="status"], .alert-success, .toast, .flash, .banner';
const messagesOnPage = (selector) => [...document.querySelectorAll(selector)]
  .filter((el) => isVisible(el) && el.innerText.trim())
  .map((el) => el.innerText.replace(/\s+/g, " ").trim().slice(0, 200));
let messagesBeforeRun = new Set(); // ignore notices the page already showed before the run started

// What the page itself says after the run, for forms whose result we can't read from a request.
function pageVerdict() {
  const fresh = (selector) => messagesOnPage(selector).find((text) => !messagesBeforeRun.has(text));
  const error = fresh(ERROR_SELECTOR);
  if (error) return { ok: false, status: 0, message: error, body: "" };
  const success = fresh(SUCCESS_SELECTOR);
  return success ? { ok: true, status: 200, message: success, body: "" } : null;
}

function outcome(stepCount) {
  const write = runRequests?.filter((r) => r.method !== "GET").at(-1);
  if (write) {
    const summary = summarizeResponse(write.status, write.response);
    return { ...summary, message: summary.ok && summary.message === "Done" ? pageVerdict()?.message || `Finished all ${stepCount} steps` : summary.message };
  }
  return pageVerdict() || { ok: true, status: 200, message: `Finished all ${stepCount} steps`, body: "" };
}

// Waits briefly for the server's answer to the last action, returning as soon as it arrives.
async function waitForReply(timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !runRequests.some((r) => r.method !== "GET")) await new Promise((resolve) => setTimeout(resolve, 50));
}

async function runOnPage({ task, values, runId, from = 0, resumed = false, quick = false, record = true }) {
  const report = (progress) => notify({ type: Msg.RUN_PROGRESS, ...progress });
  messagesBeforeRun = resumed ? new Set() : new Set([...messagesOnPage(ERROR_SELECTOR), ...messagesOnPage(SUCCESS_SELECTOR)]);
  runRequests = [];
  setCapturing();
  let result;
  try {
    const onRepair = () => updateTasks([...tasks]); // the step was updated in place; save it
    const steps = await runSteps({ task, values, runId, from, resumed, quick, report, onRepair });
    if (steps === null) return null; // a new page is loading; the run continues (and is judged) there
    if (!resumed) await waitForReply(); // the page reloaded otherwise, so there's no reply to wait for
    result = outcome(steps);
  } catch (error) {
    await clearPendingRun();
    result = { ok: false, status: 0, message: error instanceof StepError ? error.message : `Something went wrong: ${error.message}`, body: "" };
  } finally {
    runRequests = null;
    setCapturing();
  }
  report({ runId, status: "finished", result });
  if (record) recordRun(task.id, result);
  return result;
}

async function runForAgent({ callId, taskId, values }) {
  const task = tasks.find((t) => t.id === taskId);
  const result = task ? await runOnPage({ task, values, runId: callId }) : { ok: false, status: 0, message: "Task not found", body: "" };
  toPage(PageMsg.STEPS_RESULT, { callId, result });
}

// ---- Messages from the side panel ----

const handlers = {
  [Msg.GET_STATE]: () => publicState(),
  [Msg.START_RECORDING]: () => updateSession({ ...emptySession(), active: true, startUrl: location.href }).then(publicState),
  [Msg.CANCEL_RECORDING]: () => updateSession(emptySession()).then(publicState),
  [Msg.STOP_RECORDING]: async () => {
    await updateSession({ active: false });
    const times = session.interactions.map((e) => e.at);
    const teachMs = times.length > 1 ? Math.max(...times) - Math.min(...times) : null;
    const draft = buildDraft(session);
    return { draft: draft && { ...draft, teachMs }, requests: session.requests.map(summarizeRequest) };
  },
  [Msg.DRAFT_FROM_REQUEST]: ({ index }) => buildDraft(session, index),
  [Msg.SAVE_TASK]: async ({ task }) => {
    const saved = { ...task, id: task.id || crypto.randomUUID(), host, startUrl: task.startUrl || session.startUrl, createdAt: task.createdAt || Date.now() };
    await updateTasks([...tasks.filter((t) => t.id !== saved.id), saved]);
    await updateSession(emptySession());
    return saved;
  },
  [Msg.RECORD_RUN]: ({ taskId, result }) => recordRun(taskId, result),
  [Msg.CANCEL_FIX]: () => cancelPoint(),
  [Msg.DELETE_TASK]: ({ id }) => updateTasks(tasks.filter((t) => t.id !== id)).then(publicState),
  [Msg.IMPORT_TASKS]: async ({ imported }) => {
    const incoming = imported.map((t) => ({ ...t, host }));
    await updateTasks([...tasks.filter((t) => !incoming.some((i) => i.id === t.id)), ...incoming]);
    return publicState();
  },
  // Spreadsheet rows pass record: false; the panel records one summary for the whole sheet instead.
  [Msg.RUN_TASK]: async ({ taskId, values, record = true }) => {
    const result = await runInPage(tasks.find((t) => t.id === taskId), values);
    if (record) recordRun(taskId, result);
    return result;
  },
  [Msg.RUN_ON_PAGE]: ({ taskId, values, runId, quick, record }) => {
    runOnPage({ task: tasks.find((t) => t.id === taskId), values, runId, quick, record }); // progress arrives as RUN_PROGRESS messages
    return { runId };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message.type];
  if (!handler) return false;
  Promise.resolve(handler(message)).then(sendResponse, (error) => sendResponse({ error: error.message }));
  return true; // keeps the channel open for the async reply
});

loadSite(host).then(async (site) => {
  tasks = site.tasks;
  session = site.session;
  runs = site.runs;
  setCapturing();
  syncPage();
  const pending = pendingRun();
  const task = pending && tasks.find((t) => t.id === pending.taskId);
  if (task) {
    if (document.readyState !== "complete") await new Promise((resolve) => addEventListener("load", resolve, { once: true }));
    if (pending.next === 0) notify({ type: Msg.RUN_PROGRESS, runId: pending.runId, index: -1, label: "Opening the starting page", status: "done" });
    runOnPage({ task, values: pending.values, runId: pending.runId, from: pending.next, resumed: true, quick: pending.quick, record: !pending.quick }); // never re-open the start page: no reload loops
  }
});
