// Runs a saved task: fills in new values and sends the request the way the page would.
import { applyValues } from "../shared/values.js";
import { summarizeResponse } from "../shared/result.js";
import { nativeFetch } from "./network.js";
import { latestSecret } from "./secrets.js";

export class NotSignedInError extends Error {}

// Anti-forgery tokens are read fresh from the page, never from storage.
function freshToken(slot) {
  const key = slot.in === "jsonform" ? slot.key.split("|")[1] : slot.key.split(".").at(-1);
  return document.querySelector(`input[name="${CSS.escape(key)}"]`)?.value
    || document.querySelector('meta[name="csrf-token"], meta[name="csrf_token"]')?.content
    || "";
}

function buildHeaders(request, origin) {
  const headers = { ...request.headers };
  for (const name of request.secretHeaders || []) {
    if (name === "cookie") continue; // the browser attaches cookies itself
    const value = latestSecret(origin, name);
    if (value === undefined) throw new NotSignedInError(`Use the site once so it can send its "${name}" sign-in, then try again.`);
    headers[name] = value;
  }
  return headers;
}

export async function runTask(task, values = {}) {
  const assignments = task.inputs
    .filter((input) => input.enabled)
    .map((input) => ({ slot: input.slot, value: values[input.id] ?? input.example }))
    .concat((task.request.tokenSlots || []).map((slot) => ({ slot, value: freshToken(slot) })));

  const { url, body } = applyValues(task.request, assignments);
  const init = {
    method: task.request.method,
    headers: buildHeaders(task.request, new URL(url).origin),
    body: task.request.method === "GET" ? undefined : body,
  };
  // Send cookies like the site does; public cross-site APIs reject that, so retry without.
  const response = await nativeFetch(url, { ...init, credentials: "include" })
    .catch(() => nativeFetch(url, { ...init, credentials: "same-origin" }));
  return summarizeResponse(response.status, await response.text());
}
