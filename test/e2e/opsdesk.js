// End-to-end on OpsDesk: an operations employee's day — refunds (SPA, cookie + CSRF) and customers (old-style form).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "test/fixtures/opsdesk");
const APP = "http://localhost:4791";
const CHROME = process.env.WMR_CHROME || `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

// Fields the review screen will ask for each time (field steps set to "Ask each time", plus page-address inputs).
const askedFields = (p) => p.evaluate(() => [...document.querySelectorAll("li.step")]
  .filter((li) => li.querySelector(".ask select")?.value === "ask")
  .map((li) => (li.querySelector(".check label") || li.querySelector("span")).textContent.replace(/^(Fill in|Choose) /, "")));

const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  — ${info}` : ""}`);
};
const state = async () => (await fetch(`${APP}/api/_state`)).json();
const firstLine = (text) => text.trim().split("\n")[0];

async function main() {
  const server = spawn("node", [path.join(FIXTURE, "server.js")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 700));
  await fetch(`${APP}/api/_reset`, { method: "POST" });

  const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "wmr-ops-")), {
    executablePath: CHROME, headless: true, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  const extensionId = new URL(worker.url()).host;
  const site = await context.newPage();
  const openPanel = async () => {
    await site.bringToFront();
    const [tab] = await worker.evaluate(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 400, height: 900 });
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tab=${tab.id}`);
    return panel;
  };
  const type = async (selector, text) => { await site.click(selector); await site.keyboard.type(text, { delay: 15 }); };

  try {
    // Sign in to the local test app (fixture's demo password).
    await site.goto(`${APP}/login`);
    await site.fill("#email", "ops@example.test");
    await site.fill("#password", "demo");
    await site.getByRole("button", { name: "Sign in" }).click();
    await site.waitForURL(/\/orders/);

    // ---- Teach "refund an order": search → open → Issue refund → fill the dialog → Confirm ----
    const panel = await openPanel();
    await panel.waitForTimeout(600);
    await panel.screenshot({ path: path.join(ROOT, "test/e2e/empty.png") });
    await site.screenshot({ path: path.join(ROOT, "test/e2e/empty-page.png") });
    await panel.getByRole("button", { name: "Teach a new task" }).click();
    const human = () => site.waitForTimeout(900); // teach at a person's pace, so "time saved" has something to measure
    await type("#order-q", "ORD-1030"); await human();
    await site.getByRole("button", { name: "Search" }).click();
    await site.locator(".order-card").first().waitFor(); await human();
    await site.locator(".order-card").first().getByRole("button", { name: "Open" }).click(); await human();
    await site.getByRole("button", { name: "Issue refund" }).click(); await human();
    await type("#refund-amount", "500"); await human();
    await site.selectOption("#refund-reason", "damaged"); await human();
    await type("#refund-notes", "Box crushed in transit"); await human();
    await site.getByRole("button", { name: "Confirm refund" }).click();
    await site.getByText("Refund of ₹500 issued for ORD-1030").waitFor();
    await panel.getByRole("button", { name: "I'm done" }).click();
    await panel.getByRole("heading", { name: "Check your task" }).waitFor();

    await panel.screenshot({ path: path.join(ROOT, "test/e2e/review.png"), fullPage: true });
    await site.screenshot({ path: path.join(ROOT, "test/e2e/review-page.png") });
    const steps = (await panel.locator(".step-list > li > .check label").allTextContents()).map((t) => t.trim());
    const inputs = await askedFields(panel);
    check("refund: 8 steps in plain words, ending with Confirm", steps.length === 8 && /Confirm refund/.test(steps.at(-1)), steps.join(" → "));
    check("refund: asks for order, amount, reason and notes", ["Order number", "Refund amount (₹)", "Reason", "Notes"].every((l) => inputs.includes(l)), inputs.join(", "));
    await panel.getByLabel("Task name").fill("Refund an order");
    await panel.getByRole("button", { name: "Save task" }).click();
    await panel.getByRole("button", { name: "Run", exact: true }).waitFor();
    check("refund: fast background run is offered despite the security token", await panel.getByLabel("In the background").count() === 1);

    // Run on the page: the dialog's amount only updates from typing events (like React).
    await panel.getByLabel("Order number", { exact: true }).fill("ORD-1031");
    await panel.getByLabel("Refund amount (₹)", { exact: true }).fill("300");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    const onPage = firstLine(await panel.locator(".result").textContent({ timeout: 60_000 }));
    const r1031 = (await state()).refunds.find((r) => r.orderNumber === "ORD-1031");
    check("refund on page: right order, right amount (typing-only field honoured)", r1031?.amount === 300 && /ORD-1031/.test(onPage), `${onPage} · stored ₹${r1031?.amount}`);

    await panel.getByLabel("Order number", { exact: true }).fill("ORD-1032");
    await panel.getByLabel("In the background").check();
    await panel.getByRole("button", { name: "Run again" }).click();
    const background = firstLine(await panel.locator(".result").filter({ hasText: "ORD-1032" }).textContent());
    check("refund in background: fresh security token and session cookie used", /issued for ORD-1032/.test(background), background);

    // ---- The site ships a redesign: "Confirm refund" becomes "Process refund now" ----
    await fetch(`${APP}/api/_redesign?on=1`, { method: "POST" });
    await site.reload(); // the update reaches you on your next page load
    await panel.getByLabel("On the page").check();
    await panel.getByLabel("Order number", { exact: true }).fill("ORD-1033");
    await panel.getByRole("button", { name: "Run again" }).click();
    await panel.getByText("Where's “Confirm refund” now?").waitFor({ timeout: 30_000 });
    await panel.screenshot({ path: path.join(ROOT, "test/e2e/fix.png") });
    await site.screenshot({ path: path.join(ROOT, "test/e2e/fix-page.png") });
    await site.bringToFront();
    await site.getByRole("button", { name: "Process refund now" }).click();
    const fixed = firstLine(await panel.locator(".result").filter({ hasText: "ORD-1033" }).textContent({ timeout: 30_000 }));
    check("point-to-fix: after a redesign, one click on the new button finishes the run", /issued for ORD-1033/.test(fixed), fixed);
    await panel.getByLabel("Order number", { exact: true }).fill("ORD-1034");
    await panel.getByRole("button", { name: "Run again" }).click();
    const remembered = firstLine(await panel.locator(".result").filter({ hasText: "ORD-1034" }).textContent({ timeout: 30_000 }));
    const askedAgain = await panel.getByText(/Where's .* now\?/).count();
    check("point-to-fix: the next run remembers the new button", /issued for ORD-1034/.test(remembered) && askedAgain === 0, remembered);
    await fetch(`${APP}/api/_redesign?on=0`, { method: "POST" });

    // ---- 25 refunds from the team's spreadsheet ----
    await panel.getByRole("button", { name: "Run from a spreadsheet" }).click();
    await panel.getByLabel("Rows").fill(readFileSync(path.join(FIXTURE, "refunds.csv"), "utf8"));
    await panel.getByText("25 rows ready.").waitFor();
    const started = Date.now();
    await panel.getByRole("button", { name: "Run 25 rows" }).click();
    await panel.getByRole("button", { name: "Yes, run 25 times" }).click();
    await panel.getByText(/^\d+ succeeded · \d+ failed$/).waitFor({ timeout: 120_000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const summary = await panel.locator(".summary").textContent();
    const errors = await panel.locator(".sheet tr.error .status-cell").allTextContents();
    check("refund sheet: 22 issued, 3 refused with the site's reasons", summary === "22 succeeded · 3 failed", `${seconds}s — ${errors.map((e) => e.replace("✕ ", "")).join(" | ")}`);

    const download = panel.waitForEvent("download");
    await panel.getByRole("button", { name: "Download results" }).click();
    const file = await (await download).path();
    const csv = readFileSync(file, "utf8").split("\n");
    check("refund sheet: results file has every row with its outcome", csv.length === 26 && csv[0].endsWith("Result,Message"), `${csv.length - 1} rows · ${csv[8]}`);
    await panel.getByRole("button", { name: "Retry 3 failed rows" }).click();
    await panel.getByRole("button", { name: "Yes, run 3 times" }).click();
    await panel.getByRole("button", { name: "Retry 3 failed rows" }).waitFor({ timeout: 60_000 });
    const savedLine = await panel.locator(".saved").textContent().catch(() => "");
    check("refund sheet: shows the time saved", /You saved ~\d+ (min|s)/.test(savedLine), savedLine.trim());
    const afterRetry = await panel.locator(".summary").textContent();
    await panel.screenshot({ path: path.join(ROOT, "test/e2e/sheet.png") });
    await site.screenshot({ path: path.join(ROOT, "test/e2e/sheet-page.png") });
    check("refund sheet: retry re-runs only the failures and keeps earlier successes", afterRetry === "22 succeeded · 3 failed", afterRetry);
    await panel.getByLabel("Show only failed rows").check();
    const visibleRows = await panel.locator(".sheet tbody tr:visible").count();
    check("refund sheet: 'Show only failed rows' filters the sheet", visibleRows === 3, `${visibleRows} rows shown`);

    // ---- Tidy the task, then share it ----
    await panel.getByRole("button", { name: "Back to tasks" }).click();
    const lastRun = firstLine(await panel.locator(".last-run").first().textContent());
    check("home: task card summarises the last spreadsheet run", /Spreadsheet: 22 succeeded · 3 failed/.test(lastRun), lastRun);
    await panel.getByLabel("More actions").click();
    await panel.getByRole("button", { name: "Edit task" }).click();
    await panel.getByLabel("Task name").fill("Issue refund");
    await panel.getByLabel("When running, Notes").selectOption("fixed");
    await panel.getByRole("button", { name: "Save changes" }).click();
    await panel.getByRole("button", { name: "Back to tasks" }).click();
    const title = await panel.locator(".task h3").first().textContent();
    const asks = await panel.locator(".task .chips").first().getAttribute("aria-label");
    check("edit: renamed and Notes no longer asked for", title === "Issue refund" && !/Notes/.test(asks), `${title} · ${asks}`);

    await panel.locator(".task").first().hover();
    await panel.screenshot({ path: path.join(ROOT, "test/e2e/home.png"), fullPage: true });
    const exported = panel.waitForEvent("download");
    await panel.getByRole("button", { name: "Export" }).click();
    const exportFile = JSON.parse(readFileSync(await (await exported).path(), "utf8"));
    const leaks = JSON.stringify(exportFile).match(/sid=|"csrfToken":"[a-f0-9]{8,}/);
    check("export: teammates' file has the task and no session or security token", exportFile.tasks.length === 1 && !leaks, `${exportFile.tasks[0].title}, ${JSON.stringify(exportFile).length} bytes`);

    // ---- Old-style form: Add customer reloads the whole page ----
    await site.goto(`${APP}/customers/new`);
    const customers = await openPanel();
    await customers.getByRole("button", { name: "Teach a new task" }).click();
    await type("#name", "Asha Verma");
    await type("#email", "asha.verma@example.com");
    await type("#phone", "9899001122");
    await site.selectOption("#city", { index: 2 });
    await site.locator("main").getByRole("button", { name: "Add customer" }).click();
    await site.getByText("Customer Asha Verma added").waitFor();
    await customers.getByRole("button", { name: "I'm done" }).click();
    await customers.getByRole("heading", { name: "Check your task" }).waitFor();
    const customerInputs = await askedFields(customers);
    check("customer: recording survived the page reload", ["Full name", "Email", "Phone", "City"].every((l) => customerInputs.includes(l)), customerInputs.join(", "));
    await customers.getByRole("button", { name: "Save task" }).click();
    await customers.getByRole("button", { name: "Run", exact: true }).waitFor();

    await customers.getByRole("button", { name: "Run from a spreadsheet" }).click();
    // Plus one row only the server rejects (the browser has no rule for phone length).
    const csvText = readFileSync(path.join(FIXTURE, "customers.csv"), "utf8").trim() + "\nShort Phone,short.phone@example.com,12345,Pune";
    const dataTransfer = await customers.evaluateHandle((text) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], "customers.csv", { type: "text/csv" }));
      return transfer;
    }, csvText);
    await customers.locator(".drop-zone").dispatchEvent("drop", { dataTransfer });
    await customers.getByText("14 rows ready.").waitFor();
    check("customer sheet: a dropped CSV file loads like a paste", true);
    const pageStarted = Date.now();
    await customers.getByRole("button", { name: "Run 14 rows" }).click();
    await customers.getByRole("button", { name: "Yes, run 14 times" }).click();
    await customers.getByText(/^\d+ succeeded · \d+ failed$/).waitFor({ timeout: 300_000 });
    const pageSeconds = ((Date.now() - pageStarted) / 1000).toFixed(1);
    const customerSummary = await customers.locator(".summary").textContent();
    const customerError = await customers.locator(".sheet tr.error .status-cell").allTextContents();
    const customerOk = await customers.locator(".sheet tr.ok .status-cell").first().textContent();
    check("customer sheet: 12 added, browser-blocked and server-rejected rows both fail", customerSummary === "12 succeeded · 2 failed", `${pageSeconds}s (${(pageSeconds / 14).toFixed(1)}s/row) — ${customerError.join(" | ")}`);
    check("customer sheet: success shows the site's own confirmation", /Customer Rohan Gupta added/.test(customerOk), customerOk);
    const otherTab = await context.newPage();
    await otherTab.goto(`${APP}/customers/new`);
    await otherTab.waitForTimeout(2500);
    check("other tabs on the same site are never driven by a run", (await otherTab.inputValue("#name")) === "" && otherTab.url().endsWith("/customers/new"));
    await otherTab.close();
    check("customer sheet: the portal really has them", (await state()).customers.length >= 13, `${(await state()).customers.length} customers`);
  } finally {
    await context.close();
    server.kill();
  }
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
