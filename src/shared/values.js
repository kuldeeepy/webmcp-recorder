// Finds the editable values inside an HTTP request and writes new values back in.

const ID_SEGMENT = /^\d+$|^[0-9a-f-]{8,}$/i;
const QUERY_STRING = /^[^\s{]+=[^\s]*$/;
const TOKEN_KEY = /csrf|xsrf|authenticity_token|^_token$|nonce/i;
const MAX_SLOTS = 60;

export function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// A slot is one value in the request: where it lives, its key, and the recorded value.
export function extractSlots(request) {
  const slots = [];
  const url = new URL(request.url);
  const segments = url.pathname.split("/");

  segments.forEach((segment, index) => {
    if (segment && ID_SEGMENT.test(segment)) {
      slots.push({ in: "path", key: String(index), hint: `${segments[index - 1] || ""} id`.trim(), value: decodeURIComponent(segment) });
    }
  });
  for (const [key, value] of url.searchParams) slots.push({ in: "query", key, hint: key, value });

  const json = parseJson(request.body);
  if (json) walkJson(json, "", slots);
  else if (request.body?.includes("=")) {
    for (const [key, value] of new URLSearchParams(request.body)) slots.push({ in: "form", key, hint: key, value });
  }

  return slots.slice(0, MAX_SLOTS).map((slot) => (TOKEN_KEY.test(slot.hint) ? { ...slot, token: true } : slot));
}

function walkJson(node, path, slots) {
  for (const [key, value] of Object.entries(node)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (value && typeof value === "object") walkJson(value, fullPath, slots);
    else if (typeof value === "string" && QUERY_STRING.test(value)) {
      for (const [subKey, subValue] of new URLSearchParams(value)) slots.push({ in: "jsonform", key: `${fullPath}|${subKey}`, hint: subKey, value: subValue });
    } else slots.push({ in: "json", key: fullPath, hint: key, value });
  }
}

// Keeps the recorded value's type: a number stays a number, "12,500" becomes 12500.
function coerce(value, example) {
  if (typeof example === "number") return Number(String(value).replace(/[,\s]/g, ""));
  if (typeof example === "boolean") return value === true || value === "true";
  return String(value ?? "");
}

const getPath = (object, path) => path.split(".").reduce((node, key) => node?.[key], object);

function setPath(object, path, value) {
  const keys = path.split(".");
  const parent = keys.slice(0, -1).reduce((node, key) => node[key], object);
  parent[keys.at(-1)] = value;
}

// Returns a new { url, body } with each slot set to its new value.
export function applyValues(request, assignments) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/");
  const json = parseJson(request.body);
  const form = !json && request.body?.includes("=") ? new URLSearchParams(request.body) : null;

  for (const { slot, value } of assignments) {
    const typed = coerce(value, slot.value);
    if (slot.in === "path") segments[Number(slot.key)] = encodeURIComponent(typed);
    else if (slot.in === "query") url.searchParams.set(slot.key, typed);
    else if (slot.in === "form") form.set(slot.key, typed);
    else if (slot.in === "json") setPath(json, slot.key, typed);
    else if (slot.in === "jsonform") {
      const [path, subKey] = slot.key.split("|");
      const params = new URLSearchParams(getPath(json, path));
      params.set(subKey, typed);
      setPath(json, path, params.toString());
    }
  }

  url.pathname = segments.join("/");
  const body = json ? JSON.stringify(json) : form ? form.toString() : request.body;
  return { url: url.href, body };
}
