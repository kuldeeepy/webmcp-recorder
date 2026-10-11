// Run a task once per spreadsheet row. The pasted sheet itself shows each row's status live.
import { h, nextId } from "../dom.js";
import { button, viewHeader, countUp } from "../components.js";
import { parseTable, mapColumns, rowValues, unevenRows } from "../../shared/table.js";
import { canRunInBackground } from "../../shared/task-builder.js";

const PAUSE_MS = 300;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const csvCell = (value) => (/[",\n]/.test(value) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
const timeLeft = (ms) => (ms < 60_000 ? `about ${Math.max(1, Math.round(ms / 1000))} s left` : `about ${Math.round(ms / 60_000)} min left`);

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function bulkView({ task }, actions) {
  const inputs = task.inputs.filter((i) => i.enabled);
  const background = canRunInBackground(task);
  const textareaId = nextId("rows");
  const sheetArea = h("div", { class: "stack" });
  const status = h("p", { class: "summary", role: "status", "aria-live": "polite" });
  const controls = h("div", { class: "row" });
  const saved = h("p", { class: "saved", "aria-live": "polite" });
  let table = { headers: [], rows: [] }, mapping = null, results = [], cells = [], stopRequested = false, running = false, elapsedMs = 0;

  const textarea = h("textarea", {
    id: textareaId, rows: "6", spellcheck: "false", placeholder: inputs.map((i) => i.label).join("\t"),
    onInput: (event) => {
      table = parseTable(event.target.value);
      mapping = mapColumns(table.headers, inputs);
      if (mapping.headerless) table = { headers: inputs.map((i) => i.label), rows: [table.headers, ...table.rows] };
      results = table.rows.map(() => null);
      elapsedMs = 0;
      saved.replaceChildren();
      showSheet();
    },
  });

  // Drop a CSV/TSV file anywhere on the paste box.
  const dropZone = h("div", {
    class: "drop-zone",
    onDragover: (e) => { e.preventDefault(); dropZone.classList.add("over"); },
    onDragleave: () => dropZone.classList.remove("over"),
    onDrop: async (e) => {
      e.preventDefault();
      dropZone.classList.remove("over");
      const file = e.dataTransfer.files[0];
      if (!file) return;
      textarea.value = await file.text();
      textarea.dispatchEvent(new Event("input"));
    },
  }, textarea, h("p", { class: "hint drop-hint" }, "…or drop a CSV file here"));

  const copyHeaders = button("Copy header row", async (event) => {
    await navigator.clipboard.writeText(inputs.map((i) => i.label).join("\t"));
    event.target.textContent = "Copied";
  }, { variant: "text" });

  function hints() {
    const uneven = unevenRows(table);
    const noMatch = !Object.keys(mapping.columns).length && inputs.length;
    return [
      mapping.headerless && h("p", { class: "hint" }, `No header row found, so columns are used in order: ${inputs.map((i) => i.label).join(", ")}.`),
      noMatch && h("p", { class: "hint warn" }, "None of your column names match this task's fields. Use “Copy header row” to get the right names."),
      mapping.missing.length > 0 && !noMatch && h("p", { class: "hint" }, `Not in your sheet, so every row uses what you recorded: ${mapping.missing.map((i) => `${i.label} = “${i.example}”`).join(", ")}.`),
      mapping.ignored.length > 0 && h("p", { class: "hint" }, `Ignored columns: ${mapping.ignored.join(", ")}.`),
      uneven.length > 0 && h("p", { class: "hint warn" }, `Check ${plural(uneven.length, "row")} (${uneven.slice(0, 8).join(", ")}): a different number of cells than the header, so values may be in the wrong columns.`),
    ].filter(Boolean);
  }

  // The sheet as a table with a live Status column.
  function showSheet() {
    controls.replaceChildren();
    status.textContent = "";
    if (!table.rows.length) return sheetArea.replaceChildren(h("p", { class: "muted" }, "Paste at least one row under the header row."));
    const shown = inputs.filter((i) => i.id in mapping.columns);
    cells = table.rows.map(() => h("td", { class: "status-cell" }, "Waiting"));
    status.textContent = `${plural(table.rows.length, "row")} ready.`;
    sheetArea.replaceChildren(
      ...hints(),
      h("div", { class: "table-wrap sheet", tabindex: "0", role: "region", "aria-label": "Your rows and their status" },
        h("table", {},
          h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "#"), h("th", { scope: "col" }, "Status"), shown.map((i) => h("th", { scope: "col" }, i.label)))),
          h("tbody", {}, table.rows.map((row, r) =>
            h("tr", {}, h("td", {}, r + 1), cells[r], shown.map((i) => h("td", {}, row[mapping.columns[i.id]]))))))));
    controls.replaceChildren(button(`Run ${plural(table.rows.length, "row")}`, () => confirmRun(table.rows.map((_, i) => i)), { variant: "primary" }));
  }

  function setRow(index, state, message) {
    const cell = cells[index];
    cell.parentElement.className = state === "running" ? "running" : `${state} pop`;
    cell.textContent = state === "running" ? "Running…" : `${state === "ok" ? "✓" : "✕"} ${message}`;
    if (state === "running") cell.parentElement.scrollIntoView({ block: "nearest" });
  }

  function confirmRun(indexes) {
    if (!task.risky) return runRows(indexes);
    controls.replaceChildren(h("div", { class: "card confirm", role: "alertdialog", "aria-labelledby": "confirm-text" },
      h("p", { id: "confirm-text" }, `This will run “${task.title}” ${plural(indexes.length, "time")} on ${task.host}, changing data each time.`),
      h("div", { class: "row" },
        button(`Yes, run ${plural(indexes.length, "time")}`, () => runRows(indexes), { variant: "primary" }),
        button("Cancel", afterRun))));
    controls.querySelector("button").focus();
  }

  async function runRows(indexes) {
    running = true;
    stopRequested = false;
    textarea.disabled = true;
    const progress = h("progress", { max: indexes.length, value: 0, "aria-label": "Rows done" });
    const stop = button("Stop", () => { stopRequested = true; stop.disabled = true; stop.textContent = "Stopping after this row…"; }, { variant: "danger" });
    controls.replaceChildren(h("div", { class: "stack grow" }, progress,
      h("p", { class: "hint" }, background ? "Keep this panel open until it finishes." : "Keep this panel open and don't use this tab until it finishes."), stop));

    const started = Date.now();
    let done = 0;
    for (const index of indexes) {
      if (stopRequested) break;
      setRow(index, "running");
      const result = await actions.runTask(task, rowValues(table.rows[index], mapping.columns, inputs), { onPage: !background, quick: true });
      results[index] = result;
      setRow(index, result.ok ? "ok" : "error", result.message);
      done++;
      progress.value = done;
      status.textContent = `${done} of ${indexes.length} done · ${done < indexes.length ? timeLeft(((Date.now() - started) / done) * (indexes.length - done)) : "finishing"}`;
      if (background) await sleep(PAUSE_MS);
    }
    running = false;
    textarea.disabled = false;
    afterRun();
    elapsedMs += Date.now() - started; // across retries too
    showTimeSaved(results.filter((r) => r?.ok).length, elapsedMs);
    const anyOk = results.some((r) => r?.ok), anyFailed = results.some((r) => r && !r.ok);
    actions.recordRun(task, { ok: !results.some((r) => !r?.ok), partial: anyOk && anyFailed, message: `Spreadsheet: ${status.textContent}` });
  }

  // "You saved ~37 min": what the same rows would take by hand, at the speed you taught the task.
  function showTimeSaved(succeeded, elapsedMs) {
    const savedMs = (task.teachMs ?? 0) * succeeded - elapsedMs;
    if (!task.teachMs || succeeded < 2 || savedMs < 30_000) return saved.replaceChildren();
    const minutes = Math.round(savedMs / 60_000);
    const number = h("strong", { class: "saved-number" }, "0");
    saved.replaceChildren(h("span", { "aria-hidden": "true" }, "⏱ "), "You saved ~", number, minutes >= 1 ? " min" : " s",
      h("span", { class: "muted" }, ` · ${succeeded} rows done in ${Math.max(1, Math.round(elapsedMs / 1000))} s`));
    countUp(number, minutes >= 1 ? minutes : Math.round(savedMs / 1000));
  }

  // After a run: totals, then retry / continue / download / filter. Before any run, back to the sheet's Run button.
  function afterRun() {
    if (running) return;
    const failed = results.map((r, i) => (r && !r.ok ? i : null)).filter((i) => i !== null);
    const notRun = results.map((r, i) => (r ? null : i)).filter((i) => i !== null);
    const succeeded = results.filter((r) => r?.ok).length;
    if (!succeeded && !failed.length) return controls.replaceChildren(button(`Run ${plural(table.rows.length, "row")}`, () => confirmRun(notRun), { variant: "primary" }));
    status.textContent = `${succeeded} succeeded · ${failed.length} failed${notRun.length ? ` · ${notRun.length} not run` : ""}`;
    const filterId = nextId("failed-only");
    controls.replaceChildren(...[
      failed.length > 0 && button(`Retry ${plural(failed.length, "failed row")}`, () => confirmRun(failed), { variant: "primary" }),
      notRun.length > 0 && button(`Run the remaining ${plural(notRun.length, "row")}`, () => confirmRun(notRun), { variant: failed.length ? "secondary" : "primary" }),
      button("Download results", () => download(`${task.name}-results.csv`,
        [[...table.headers, "Result", "Message"], ...table.rows.map((row, i) => [...row, results[i] ? (results[i].ok ? "OK" : "Failed") : "Not run", results[i]?.message ?? ""])]
          .map((line) => line.map(csvCell).join(",")).join("\n"), "text/csv")),
      failed.length > 0 && h("div", { class: "check" },
        h("input", { type: "checkbox", id: filterId, onChange: (e) => sheetArea.querySelector(".sheet").classList.toggle("failed-only", e.target.checked) }),
        h("label", { for: filterId }, "Show only failed rows")),
    ].filter(Boolean));
  }

  return h("main", { class: "view" },
    viewHeader("Run from a spreadsheet", { onBack: actions.goHome, subtitle: task.title }),
    h("section", { class: "card stack" },
      h("p", {}, "Copy rows from Excel or Google Sheets, header row first, and paste them below. Columns are matched to fields by name."),
      h("p", { class: "hint" }, background ? "Rows run in the background, about one every half second." : "Rows run on the page, one after another, about a second each."),
      h("p", { class: "chips", "aria-label": "Expected columns" }, inputs.map((i) => h("span", { class: "chip" }, i.label))),
      copyHeaders,
      h("div", { class: "field" }, h("label", { for: textareaId }, "Rows"), dropZone)),
    status, saved, controls, sheetArea);
}
