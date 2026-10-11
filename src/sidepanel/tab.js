// Connection to the content script of the tab the side panel is showing.
import { Msg } from "../shared/messages.js";

export class PageNotReadyError extends Error {}

// "?tab=123" pins the panel to one tab (used by tests and when opened as a normal page).
export async function currentTabId() {
  const pinned = new URLSearchParams(location.search).get("tab");
  if (pinned) return Number(pinned);
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

export async function sendToTab(tabId, type, payload = {}) {
  try {
    const reply = await chrome.tabs.sendMessage(tabId, { type, ...payload });
    if (reply?.error) throw new Error(reply.error);
    return reply;
  } catch (error) {
    if (/Receiving end does not exist|Could not establish connection/i.test(error.message)) throw new PageNotReadyError();
    throw error;
  }
}

const RUN_TIMEOUT_MS = 120_000;
const runListeners = new Map();

// Starts an on-page run and resolves with its result; onProgress gets each step as it happens.
export async function runOnPage(tabId, taskId, values, onProgress = () => {}, quick = false) { // quick = spreadsheet row
  const runId = crypto.randomUUID();
  const finished = new Promise((resolve) => {
    runListeners.set(runId, (progress) => (progress.status === "finished" ? resolve(progress.result) : onProgress(progress)));
    setTimeout(() => resolve({ ok: false, status: 0, message: "The page stopped responding.", body: "" }), RUN_TIMEOUT_MS);
  });
  await sendToTab(tabId, Msg.RUN_ON_PAGE, { taskId, values, runId, quick, record: !quick });
  const result = await finished;
  runListeners.delete(runId);
  return result;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === Msg.RUN_PROGRESS) runListeners.get(message.runId)?.(message);
});

export function onTabState(handler) {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === Msg.STATE_CHANGED) handler(sender.tab?.id, message.state);
  });
}
