// "Here's what we understood": one list of steps; each field says whether it's asked each time or always the same.
import { h, nextId } from "../dom.js";
import { button, viewHeader } from "../components.js";
import { describeStep } from "../../shared/steps.js";

const shorten = (value, max = 28) => (String(value).length > max ? `${String(value).slice(0, max)}…` : String(value));

// "Ask each time" makes it an input of the task; otherwise the recorded value is always used.
function askChoice(input, label) {
  const id = nextId("ask");
  return h("div", { class: "ask" },
    h("label", { for: id, class: "visually-hidden" }, `When running, ${label}`),
    h("select", { id, onChange: (e) => { input.enabled = e.target.value === "ask"; } },
      h("option", { value: "ask", selected: input.enabled }, "Ask each time"),
      h("option", { value: "fixed", selected: !input.enabled }, `Always “${shorten(input.example)}”`)));
}

function pickChoice(step) {
  const id = nextId("pick");
  return h("div", { class: "ask" },
    h("label", { for: id, class: "visually-hidden" }, `Which item to click for “${step.label}”`),
    h("select", { id, onChange: (e) => { step.pick = e.target.value; } },
      h("option", { value: "first", selected: step.pick === "first" }, "The first result"),
      h("option", { value: "exact", selected: step.pick === "exact" }, `Exactly “${shorten(step.label)}”`)));
}

function stepRow(step, draft) {
  const id = nextId("step");
  const input = step.kind === "field" && draft.inputs.find((i) => i.id === step.inputId);
  const text = step.kind === "click" && step.target?.list ? "Click a result" : describeStep(step);
  const extra = input ? askChoice(input, step.label) : step.kind === "click" && step.target?.list ? pickChoice(step) : null;
  const choice = h("div", { hidden: !step.enabled }, extra);
  return h("li", { class: "step" },
    h("div", { class: "check" },
      h("input", { type: "checkbox", id, checked: step.enabled, onChange: (e) => { step.enabled = e.target.checked; choice.hidden = !step.enabled; } }),
      h("label", { for: id }, text)),
    choice);
}

// Inputs that don't come from a field you filled in: values in the page address, or (rarely) in the request itself.
function otherInputs(draft) {
  const others = draft.inputs.filter((i) => i.source !== "field");
  if (!others.length) return null;
  return h("fieldset", { class: "card" },
    h("legend", {}, "Also asks for"),
    h("p", { class: "hint" }, others[0].source === "url" ? "These are in the page address, like the dates on a booking page." : "We couldn't match fields you filled in, so these come from what the site received."),
    h("ul", { class: "plain-list" }, others.map((input) => h("li", { class: "step" }, h("span", {}, input.label), askChoice(input, input.label)))));
}

function manualPicker(requests, actions) {
  const sent = requests.map((r, index) => ({ ...r, index })).filter((r) => r.status);
  if (!sent.length) return null;
  return h("details", { class: "card" },
    h("summary", {}, "Advanced: choose which request does the work"),
    h("p", { class: "hint" }, "Used for fast background runs and spreadsheets."),
    h("ul", { class: "request-list" }, sent.reverse().map((r) =>
      h("li", {}, button(`${r.method} ${r.host}${r.path}`, () => actions.pickRequest(r.index), { variant: "text mono" })))));
}

export function reviewView({ review }, actions) {
  const { draft, requests, editing } = review;
  if (!draft) {
    return h("main", { class: "view" },
      viewHeader("We didn't catch that", { onBack: actions.discardDraft }),
      h("p", {}, "We didn't see you fill in or click anything. Try again and do the task on the page itself."),
      button("Try again", actions.startRecording, { variant: "primary" }));
  }

  const nameId = nextId("name"), riskId = nextId("risk");
  return h("main", { class: "view" },
    editing
      ? viewHeader("Edit task", { onBack: actions.discardDraft, subtitle: "Rename it, leave out steps, or choose what it asks for each time." })
      : viewHeader("Check your task", { onBack: actions.discardDraft, subtitle: "Here's what we understood. Adjust anything that's off." }),
    h("form", { class: "stack", onSubmit: (e) => { e.preventDefault(); actions.saveDraft(draft); } },
      h("div", { class: "field" },
        h("label", { for: nameId }, "Task name"),
        h("input", { id: nameId, value: draft.title, required: true, onInput: (e) => { draft.title = e.target.value; } })),
      draft.steps?.length > 0 && h("fieldset", { class: "card" },
        h("legend", {}, "Steps"),
        h("p", { class: "hint" }, "Untick anything you did by mistake. For each field, choose whether to ask for it each time."),
        h("ol", { class: "step-list" }, draft.steps.map((step) => stepRow(step, draft)))),
      otherInputs(draft),
      h("div", { class: "check card" },
        h("input", { type: "checkbox", role: "switch", id: riskId, checked: draft.risky, onChange: (e) => { draft.risky = e.target.checked; } }),
        h("label", { for: riskId }, "This task changes data on the site", h("span", { class: "muted block" }, "We'll ask before running it many times."))),
      manualPicker(requests, actions),
      h("div", { class: "row sticky-actions" },
        h("button", { type: "submit", class: "button primary" }, editing ? "Save changes" : "Save task"),
        button(editing ? "Cancel" : "Discard", actions.discardDraft))));
}
