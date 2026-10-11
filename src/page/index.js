// Page-world entry: capture while recording, run tasks in the background, and register WebMCP tools.
import { PageMsg } from "../shared/messages.js";
import { canRunInBackground } from "../shared/task-builder.js";
import { toContent, onContentMessage } from "./bridge.js";
import { installNetworkCapture } from "./network.js";
import { installInteractionCapture } from "./interactions.js";
import { runTask, NotSignedInError } from "./replay.js";
import { syncTools } from "./webmcp.js";

const capture = { interactions: false, requests: false };
const pendingStepRuns = new Map();

installNetworkCapture({ isRecording: () => capture.requests, onRequest: (request) => toContent(PageMsg.REQUEST, request) });
installInteractionCapture({ isRecording: () => capture.interactions, onInteraction: (event) => toContent(PageMsg.INTERACTION, event) });

async function runInBackground(task, values) {
  try {
    return await runTask(task, values);
  } catch (error) {
    const message = error instanceof NotSignedInError ? error.message : `Couldn't reach the site: ${error.message}`;
    return { ok: false, status: 0, message, body: "" };
  }
}

// Agents get the fast background run when it's equivalent; otherwise the steps are replayed on the page.
function runForAgent(task, values) {
  if (canRunInBackground(task)) return runInBackground(task, values);
  const callId = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingStepRuns.set(callId, resolve);
    toContent(PageMsg.RUN_STEPS, { callId, taskId: task.id, values });
  });
}

onContentMessage(async (type, data) => {
  if (type === PageMsg.SET_CAPTURING) Object.assign(capture, data);
  if (type === PageMsg.SET_TASKS) syncTools(data, runForAgent);
  if (type === PageMsg.RUN) toContent(PageMsg.RUN_RESULT, { runId: data.runId, result: await runInBackground(data.task, data.values) });
  if (type === PageMsg.STEPS_RESULT) {
    pendingStepRuns.get(data.callId)?.(data.result);
    pendingStepRuns.delete(data.callId);
  }
});
