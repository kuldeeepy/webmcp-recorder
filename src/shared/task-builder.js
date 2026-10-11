// Turns what the user did (fields, clicks) and what the page sent (requests) into a reusable task.
//   steps:   the on-page actions, replayed visibly
//   request: the one server call that does the same work, replayed in the background when possible
import { extractSlots, applyValues } from "./values.js";
import { snakeCase, humanize } from "./text.js";

const READ_ONLY_PATH = /search|query|lookup|filter|autocomplete|suggest|find/i;
const TECHNICAL_HINT = /agent|api.?key|app(lication)?.?id|version|analytics|track|timestamp|session|^_|^\d+$|^(source|client|locale|lang)$|^utm_|^(ref|fbclid|gclid)$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAV_LIST = /nav|menu|tab|breadcrumb|page-link|dropdown/i;
const ACTIONS = new Set(["click", "submit", "enter"]);

const normalize = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  const number = text.replace(/[,\s₹$]/g, "");
  return number !== "" && !Number.isNaN(Number(number)) ? String(Number(number)) : text;
};

// Last value of each field the user filled in, positioned where they first touched it.
export function latestFields(interactions) {
  const fields = new Map();
  for (const event of interactions) {
    if (event.kind !== "field" || String(event.value ?? "").trim() === "") continue;
    fields.set(event.key, { ...event, at: fields.get(event.key)?.at ?? event.at });
  }
  // Some sites mirror one box into a hidden twin with the same label; treat them as one field.
  const all = [...fields.values()];
  return all.filter((field, i) => !all.slice(0, i).some((other) => other.label === field.label && other.value === field.value));
}

const lastAction = (interactions) => interactions.filter((e) => ACTIONS.has(e.kind)).at(-1);

function matchFields(slots, fields) {
  const matches = [];
  for (const field of fields) {
    const slot = slots.find((s) => !s.token && normalize(s.value) === normalize(field.value) && !matches.some((m) => m.slot === s));
    if (slot) matches.push({ field, slot });
  }
  return matches;
}

// Picks the request that best explains what the user did.
export function pickRequest(requests, interactions) {
  const fields = latestFields(interactions);
  const action = lastAction(interactions);
  let best = null;
  requests.forEach((request, index) => {
    const matches = matchFields(extractSlots(request), fields).length;
    const score = matches * 10
      + (request.method !== "GET" ? 3 : 0)
      + (action && request.at >= action.at ? 2 : 0)
      + (request.status >= 200 && request.status < 300 ? 1 : 0);
    if (!best || score >= best.score) best = { index, score };
  });
  return best && best.score > 0 ? best.index : -1;
}

// A click on one of many look-alike items after typing (a search result) should hit "the first result" next time.
const defaultPick = (event, typedBefore) =>
  event.target?.list && typedBefore && !NAV_LIST.test(event.target.list.itemSelector) ? "first" : "exact";

export function buildSteps(interactions) {
  const events = [...latestFields(interactions), ...interactions.filter((e) => ACTIONS.has(e.kind))].sort((a, b) => a.at - b.at);
  return events.map((event, index) => {
    const base = { kind: event.kind === "submit" ? "click" : event.kind, label: event.label, target: event.target, enabled: true };
    if (event.kind !== "field") {
      const typedBefore = events.slice(0, index).some((e) => e.kind === "field");
      return base.kind === "click" ? { ...base, pick: defaultPick(event, typedBefore) } : base;
    }
    return { ...base, type: event.type, value: event.value, display: event.display, inputId: snakeCase(event.label) };
  });
}

function requestPart(request, slots) {
  const tokens = slots.filter((s) => s.token);
  return {
    method: request.method,
    headers: request.headers,
    secretHeaders: request.secretHeaders,
    // Anti-forgery tokens are blanked here and read fresh from the page at run time.
    ...applyValues(request, tokens.map((slot) => ({ slot, value: "" }))),
    tokenSlots: tokens,
  };
}

// Background replay only reproduces the task if nothing else changed data after the picked request.
const isLastWrite = (requests, index) =>
  requests[index].status >= 200 && requests[index].status < 300
  && !requests.some((r, i) => i !== index && r.method !== "GET" && r.at > requests[index].at);

// Values in the starting page's address (?checkin=2026-10-11) are inputs too: they change what the page does.
function urlInputs(startUrl, slots, taken) {
  if (!startUrl) return [];
  return [...new URL(startUrl).searchParams]
    .filter(([key, value]) => value && !TECHNICAL_HINT.test(key) && !taken.has(snakeCase(key)))
    .map(([key, value]) => ({
      id: snakeCase(key), label: humanize(key), type: DATE.test(value) ? "date" : "text", example: value,
      slot: slots.find((s) => !s.token && normalize(s.value) === normalize(value)) ?? null, source: "url", urlKey: key, enabled: true,
    }));
}

export function buildDraft({ requests, interactions, startUrl }, chosenIndex) {
  const index = chosenIndex ?? pickRequest(requests, interactions);
  const request = requests[index];
  const steps = buildSteps(interactions);
  if (!request && !steps.length) return null;

  const slots = request ? extractSlots(request) : [];
  const fields = latestFields(interactions);
  const matches = matchFields(slots, fields);
  const slotFor = (label) => matches.find((m) => m.field.label === label)?.slot ?? null;

  const typedInputs = steps.filter((s) => s.kind === "field").map((s) => ({
    id: s.inputId, label: s.label, type: s.type, options: fields.find((f) => f.label === s.label)?.options,
    example: slotFor(s.label)?.value ?? s.value, slot: slotFor(s.label), source: "field", enabled: true,
  }));
  const guessedInputs = slots.filter((s) => !s.token && !TECHNICAL_HINT.test(s.hint)).map((slot) => ({
    id: snakeCase(slot.hint), label: humanize(slot.hint), type: typeof slot.value === "number" ? "number" : "text",
    example: slot.value, slot, source: "request", enabled: true,
  }));
  const fromPage = typedInputs.length ? typedInputs : guessedInputs;
  const inputs = dedupeIds([...fromPage, ...urlInputs(startUrl, slots, new Set(fromPage.map((i) => i.id)))]);

  const action = lastAction(interactions)?.label;
  const path = request ? new URL(request.url).pathname : "";
  const title = action || humanize(`${request?.method === "GET" ? "get" : "send"} ${path.split("/").filter(Boolean).slice(-2).join(" ")}`);
  const writes = requests.some((r) => r.method !== "GET");

  return {
    name: snakeCase(title),
    title,
    // Old-style forms post without a request we can see, so a task that clicks with no request at all is treated as changing data.
    risky: writes ? !requests.filter((r) => r.method !== "GET").every((r) => READ_ONLY_PATH.test(new URL(r.url).pathname)) : !request && steps.some((s) => s.kind !== "field"),
    inputs,
    steps: steps.map((s) => (s.kind === "field" ? { ...s, inputId: inputs.find((i) => i.source === "field" && i.label === s.label)?.id } : s)),
    matchedBy: matches.length ? "typed" : typedInputs.length ? "page" : "guessed",
    request: request ? { ...requestPart(request, slots), replayable: isLastWrite(requests, index) } : null,
    requestIndex: index,
  };
}

function dedupeIds(inputs) {
  const seen = new Set();
  return inputs.map((input) => {
    let id = input.id;
    while (seen.has(id)) id += "_2";
    seen.add(id);
    return { ...input, id };
  });
}

// True when the fast background replay does exactly what the visible replay would.
export const canRunInBackground = (task) =>
  !!task.request?.replayable && task.inputs.filter((i) => i.enabled).every((i) => i.slot);
