// Turns a raw HTTP response into a short sentence a person can read.
import { parseJson } from "./values.js";

const MESSAGE_KEYS = ["message", "error", "detail", "result", "title", "status"];

// What common failure codes usually mean, for sites whose own message doesn't say.
const STATUS_HINTS = {
  401: "you may need to sign in again",
  403: "you don't have permission for this",
  404: "it may no longer exist",
  409: "it clashes with something that already exists, like a booked date or a duplicate",
  422: "some values weren't accepted",
  429: "too many requests; try again shortly",
};

export function summarizeResponse(status, text) {
  const ok = status >= 200 && status < 300;
  const json = parseJson(text);
  const said = json && MESSAGE_KEYS.map((key) => json[key]).find((v) => typeof v === "string" && v.trim());
  const list = Array.isArray(json) ? json : json && Object.values(json).find(Array.isArray);

  // Failures often come as {"errors": ["size must be between 3 and 30"]}: show the reasons, not a count.
  const reasons = !ok && list?.filter((item) => typeof item === "string" || typeof item?.message === "string").map((item) => item.message ?? item);
  let message = said || (reasons?.length ? reasons.join("; ") : null);
  if (!message && list) message = `${list.length} result${list.length === 1 ? "" : "s"}`;
  if (!message) message = ok ? "Done" : `The site rejected it (HTTP ${status})`;
  const selfExplained = /already|exist|duplicate|not found|no longer|permission|denied|sign|log ?in|too many|invalid|must|required/i.test(message);
  if (!ok && !reasons?.length && !selfExplained && STATUS_HINTS[status]) message += ` (${STATUS_HINTS[status]})`;
  return { ok, status, message, body: text };
}
