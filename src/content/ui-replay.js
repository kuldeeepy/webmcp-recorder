// Replays a task's steps on the live page, visibly, and carries on after the page reloads or navigates.
import { locate, fieldLabel, clickLabel, describe } from "../shared/dom.js";
import { glideTo, ripple, typeInto, hideCursor } from "./ghost.js";
import { pointAt } from "./point-to-fix.js";
import { describeStep } from "../shared/steps.js";

const FIND_TIMEOUT_MS = 10_000;
const FIND_BEFORE_ASKING_MS = 4_000; // with someone watching, ask them sooner than we'd give up unattended
const SETTLE_QUIET_MS = 400;
const SETTLE_AFTER_TYPING_MS = 150;
const SETTLE_MAX_MS = 6_000;
const RESUME_WINDOW_MS = 20_000; // a page load, not a later visit
const FIRST_STEP_GRACE_MS = 1_500;
// A run in progress is kept in this tab's sessionStorage: other tabs on the same site never pick it up.
const PENDING_KEY = "wmr:pending-run";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class StepError extends Error {}

// Set when the page starts loading a new document (e.g. an old-style form submit), so the run hands over to that page.
let leaving = false;
globalThis.navigation?.addEventListener("navigate", (event) => { if (!event.destination.sameDocument) leaving = true; });
addEventListener("pagehide", () => { leaving = true; });

async function waitFor(find, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = find();
    if (found) return found;
    await sleep(100);
  }
  return null;
}

// Resolves once the page stops changing (or after a cap), so the next step sees the new content.
function settle(quietMs = SETTLE_QUIET_MS) {
  return new Promise((resolve) => {
    let quiet;
    const done = () => { observer.disconnect(); clearTimeout(cap); clearInterval(watch); resolve(); };
    const watch = setInterval(() => leaving && done(), 50);
    const observer = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, quietMs); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    quiet = setTimeout(done, quietMs);
    const cap = setTimeout(done, SETTLE_MAX_MS);
  });
}

// Sets a value the way typing would, so React/Angular/Vue notice each change.
function setValue(element, text) {
  const proto = Object.getPrototypeOf(element);
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, text);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function fill(element, value, animate) {
  element.focus();
  if (element.type === "checkbox" || element.type === "radio") {
    element.checked = String(value) === "true";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    const text = String(value ?? "");
    const option = element.tagName === "SELECT" && ![...element.options].some((o) => o.value === text)
      ? [...element.options].find((o) => o.text.trim().toLowerCase() === text.toLowerCase()) : null;
    const final = option ? option.value : text;
    if (animate) await typeInto(element, final, (partial) => setValue(element, partial));
    else setValue(element, final);
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

// The browser's own form checks ("Please include an '@'") block a submit without changing the page; report them.
function blockedSubmit(element) {
  const form = element.form || element.closest("form");
  const submits = form && (element.type === "submit" || (element.tagName === "BUTTON" && !element.getAttribute("type")));
  if (!submits || form.noValidate || form.checkValidity()) return null;
  const invalid = [...form.elements].find((field) => field.willValidate && !field.validity.valid);
  return `${fieldLabel(invalid)}: ${invalid.validationMessage}`;
}

function pressEnter(element) {
  for (const type of ["keydown", "keypress", "keyup"]) {
    element.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  element.form?.requestSubmit();
}

const samePage = (a, b) => {
  const x = new URL(a), y = new URL(b);
  return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
};

function startUrlFor(task, values) {
  if (!task.startUrl) return null;
  const url = new URL(task.startUrl);
  for (const input of task.inputs.filter((i) => i.source === "url" && i.enabled)) url.searchParams.set(input.urlKey, values[input.id] ?? input.example);
  return url.href;
}

// Runs from `from` to the end. Progress is saved before every action because an action may load a new page.
// onRepair(step, target) is called when the person points at a moved element, so the task remembers it.
export async function runSteps({ task, values, runId, from = 0, resumed = false, quick = false, report, onRepair }) {
  if (!task.steps?.length) throw new StepError("This task was saved by an older version. Delete it and teach it again.");
  const steps = task.steps.filter((s) => s.enabled);
  const save = (next) => sessionStorage.setItem(PENDING_KEY, JSON.stringify({ runId, taskId: task.id, values, next, quick, at: Date.now() }));

  const startUrl = startUrlFor(task, values);
  // Start fresh on the starting page if we're elsewhere, or if it's changed (a form replaced by "Thanks!").
  if (!resumed && startUrl && (!samePage(startUrl, location.href) || !(await waitFor(() => locate(steps[0]), FIRST_STEP_GRACE_MS)))) {
    report({ runId, index: -1, total: steps.length, label: "Opening the starting page", status: "running" });
    await save(0);
    samePage(startUrl, location.href) ? location.reload() : location.assign(startUrl);
    return null; // the content script on the new page picks up from here
  }

  for (let index = from; index < steps.length; index++) {
    const step = steps[index];
    const label = describeStep(step);
    report({ runId, index, total: steps.length, label, status: "running" });
    let element = await waitFor(() => locate(step), quick ? FIND_TIMEOUT_MS : FIND_BEFORE_ASKING_MS);
    if (!element && !quick) {
      hideCursor();
      report({ runId, index, total: steps.length, label: step.label, kind: step.kind, status: "needs-fix" });
      element = await pointAt(step);
      if (element) {
        step.target = describe(element, step.kind === "field" ? fieldLabel(element) : clickLabel(element));
        step.pick = "exact";
        await onRepair?.(step);
        report({ runId, index, total: steps.length, label, status: "fixed" });
      }
    }
    if (!element) {
      hideCursor();
      const what = step.kind === "click" && step.pick === "first" ? "any result to click" : `“${step.label}”`;
      throw new StepError(`Couldn't find ${what} on the page. The page may have changed or you may be signed out. Run it once on its own to point at the new spot.`);
    }
    await save(index + 1);
    element.scrollIntoView({ block: "center", behavior: quick || reducedMotion() ? "auto" : "smooth" });
    if (!quick) await glideTo(element); // the ghost cursor shows a person what's happening
    if (step.kind === "field") await fill(element, step.inputId && step.inputId in values ? values[step.inputId] : step.value, !quick);
    else {
      const blocked = blockedSubmit(element);
      if (blocked) { hideCursor(); throw new StepError(blocked); }
      if (!quick) ripple(element);
      if (step.kind === "enter") pressEnter(element);
      else element.click();
    }
    report({ runId, index, total: steps.length, label, status: "done" });
    await settle(step.kind === "field" ? SETTLE_AFTER_TYPING_MS : SETTLE_QUIET_MS);
    if (leaving) return null; // the next page picks the run up and judges the result
  }
  hideCursor();
  await clearPendingRun();
  return steps.length;
}

export const clearPendingRun = () => sessionStorage.removeItem(PENDING_KEY);

// A run that was interrupted by a page load, if it's recent enough to continue.
export function pendingRun() {
  let state = null;
  try { state = JSON.parse(sessionStorage.getItem(PENDING_KEY)); } catch {}
  clearPendingRun(); // one chance to resume; save() writes it again before the next action
  return state && Date.now() - state.at <= RESUME_WINDOW_MS ? state : null;
}
