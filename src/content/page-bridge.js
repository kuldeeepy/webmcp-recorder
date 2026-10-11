// Talks to the page script, and turns "run" into a promise that resolves with its result.
import { Channel, PageMsg } from "../shared/messages.js";

const RUN_TIMEOUT_MS = 30_000;
const pendingRuns = new Map();

export const toPage = (type, data) => window.postMessage({ source: Channel.CONTENT, type, data }, location.origin);

export function onPageMessage(handler) {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== Channel.PAGE) return;
    const { type, data } = event.data;
    if (type === PageMsg.RUN_RESULT) {
      pendingRuns.get(data.runId)?.(data.result);
      pendingRuns.delete(data.runId);
    } else handler(type, data);
  });
}

export function runInPage(task, values) {
  const runId = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingRuns.set(runId, resolve);
    toPage(PageMsg.RUN, { runId, task, values });
    setTimeout(() => {
      if (pendingRuns.delete(runId)) resolve({ ok: false, status: 0, message: "The site took too long to answer.", body: "" });
    }, RUN_TIMEOUT_MS);
  });
}
