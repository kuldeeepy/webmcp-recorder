// End-to-end: real extension + side panel in Chromium, on the VendorDesk mock and on live Wikipedia.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DIST = path.join(ROOT, "dist");
const FIXTURE = path.join(ROOT, "test/fixtures/vendordesk");
const PORTAL = "http://localhost:4790";
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

// Playwright's Chromium has no WebMCP, so a minimal stand-in records registered tools.
function webmcpStandIn() {
  const tools = new Map();
  Object.defineProperty(document, "modelContext", { value: {
    registerTool: async (tool, { signal } = {}) => { tools.set(tool.name, tool); signal?.addEventListener("abort", () => tools.delete(tool.name)); },
    getTools: async () => [...tools.values()],
    call: async (name, args) => (await tools.get(name).execute(args)).content[0].text,
  } });
}

async function main() {
  const server = spawn("node", [path.join(FIXTURE, "server.js")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));
  await fetch(`${PORTAL}/api/_reset`, { method: "POST" });

  const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "wmr-")), {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  await context.addInitScript(webmcpStandIn);
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

  try {
    // ---- VendorDesk: teach "Save invoice" once, then run it once and for 50 spreadsheet rows ----
    await site.goto(PORTAL);
    await site.fill("#login-email", "ops@example.test");
    await site.fill("#login-password", "demo");
    await site.press("#login-password", "Enter");
    await site.waitForSelector("#invoice-form");

    const panel = await openPanel();
    await panel.getByRole("button", { name: "Teach a new task" }).click();
    await panel.getByText("Do the task now").waitFor();

    await site.fill("#vendor-name", "Kumar Electricals");
    await site.fill("#gstin", "07AABCS1429B1Z5");
    await site.fill("#invoice-no", "INV-MANUAL-1");
    await site.fill("#invoice-date", "2026-10-11");
    await site.fill("#amount", "4500");
    await site.selectOption("#gst-rate", "12");
    await site.selectOption("#category", "utilities");
    await site.getByRole("button", { name: "Save invoice" }).click();

    await panel.getByText("Clicked “Save invoice”").waitFor();
    await panel.getByText(/Site received data \(POST \/api\/invoices\)/).waitFor();
    check("recording: timeline shows the user's steps in plain words", true);

    await panel.getByRole("button", { name: "I'm done" }).click();
    await panel.getByRole("heading", { name: "Check your task" }).waitFor();
    const name = await panel.getByLabel("Task name").inputValue();
    const labels = await askedFields(panel);
    check("review: task named after the button", name === "Save invoice", name);
    check("review: steps fill the fields before clicking save", (await panel.locator(".step-list > li > .check label").allTextContents()).at(-1).includes("Save invoice"));
    check("review: inputs are the page's own labels", ["Vendor name", "GSTIN", "Invoice number", "Invoice date", "Amount (₹)", "GST rate", "Category"].every((l) => labels.includes(l)), labels.join(", "));
    check("review: hidden technical values (source, clientVersion)", !labels.some((l) => /source|client/i.test(l)));
    check("review: marked as changing data", await panel.getByRole("switch").isChecked());

    await panel.getByRole("button", { name: "Save task" }).click();
    await panel.getByRole("heading", { name: "Save invoice" }).waitFor();
    check("run: form uses a dropdown with the site's options", await panel.getByLabel("Category").evaluate((el) => el.tagName === "SELECT" && el.options.length > 3));
    await panel.getByLabel("Invoice number").fill("INV-RUN-1");
    await panel.getByRole("button", { name: "Run", exact: true }).click();
    const single = await panel.getByRole("status").filter({ hasText: /saved|exists|rejected|find/ }).textContent();
    check("run on page: fills the real form, saves, and reports the site's message", single.includes("Invoice INV-RUN-1 saved"), single.trim().split("\n")[0]);
    check("run on page: the invoice appears in the portal's own table", await site.getByRole("cell", { name: "INV-RUN-1" }).isVisible());

    await panel.getByLabel("Invoice number").fill("INV-BG-1");
    await panel.getByLabel("In the background").check();
    await panel.getByRole("button", { name: "Run again" }).click();
    const bg = await panel.locator(".result").filter({ hasText: "INV-BG-1" }).textContent();
    check("run in background: same task, no page interaction", bg.includes("Invoice INV-BG-1 saved"), bg.trim().split("\n")[0]);

    const tool = await site.evaluate(() => document.modelContext.call("save_invoice", { invoice_number: "INV-AGENT-1", amount: 99 }));
    check("webmcp: an agent can call save_invoice", tool.startsWith("OK (HTTP 201)"), tool.split("\n")[0]);

    await panel.getByRole("button", { name: "Run from a spreadsheet" }).click();
    await panel.getByLabel("Rows").fill(readFileSync(path.join(FIXTURE, "invoices.csv"), "utf8"));
    await panel.getByText("50 rows ready.").waitFor();
    const started = Date.now();
    await panel.getByRole("button", { name: "Run 50 rows" }).click();
    await panel.getByRole("button", { name: "Yes, run 50 times" }).click();
    await panel.getByText(/succeeded · \d+ failed/).waitFor({ timeout: 120_000 });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const summary = await panel.locator(".summary").textContent();
    const errors = await panel.locator(".sheet tr.error .status-cell").allTextContents();
    check("bulk: 48 rows saved, the 2 bad rows fail with the site's reason", summary === "48 succeeded · 2 failed", `${summary} in ${seconds}s — ${errors.map((e) => e.replace("✕ ", "")).join(" | ")}`);

    const saved = await site.evaluate(async () => (await (await fetch("/api/invoices", { headers: { authorization: `Bearer ${localStorage.token}` } })).json()).length);
    check("bulk: portal really has every invoice (1 manual + 2 runs + 1 agent + 48)", saved === 52, `${saved} invoices`);
    await panel.screenshot({ path: path.join(ROOT, "test/e2e/bulk.png"), fullPage: true });

    // ---- Wikipedia (live): search-as-you-type, no submit button ----
    await site.goto("https://en.wikipedia.org/wiki/Main_Page");
    const wiki = await openPanel();
    await wiki.getByRole("button", { name: "Teach a new task" }).click();
    await site.locator("input[name=search]").first().click();
    await site.keyboard.type("Taj Mahal", { delay: 60 });
    await site.waitForTimeout(3000); // search-as-you-type: let the last request finish, like a person pausing
    await wiki.getByRole("button", { name: "I'm done" }).click();
    await wiki.getByRole("heading", { name: "Check your task" }).waitFor();
    const wikiInputs = await askedFields(wiki);
    check("wikipedia: search box becomes the input, marked read-only", wikiInputs.includes("Search Wikipedia") && !(await wiki.getByRole("switch").isChecked()), wikiInputs.join(", "));
    await wiki.getByRole("button", { name: "Save task" }).click();
    await wiki.getByRole("button", { name: "Run", exact: true }).waitFor();
    await wiki.getByLabel("Search Wikipedia", { exact: true }).fill("Qutub Minar");
    await wiki.getByLabel("In the background").check();
    await wiki.getByRole("button", { name: "Run", exact: true }).click();
    const wikiResult = await wiki.getByRole("status").filter({ hasText: /result|Done|rejected/ }).textContent();
    await wiki.getByText("Show what the site sent back").click();
    const body = await wiki.locator("pre").textContent();
    check("wikipedia: replay returns new results", /Qutb Minar/.test(body), wikiResult.trim().split("\n")[0]);

    // ---- Toolshop (live): search → open the first result → add to cart, replayed on the page ----
    const cartCount = async () => Number((await site.locator('[data-test="cart-quantity"]').textContent({ timeout: 2000 }).catch(() => "0")) || 0);
    await site.goto("https://practicesoftwaretesting.com/");
    await site.locator('[data-test="search-query"]').waitFor();
    const shop = await openPanel();
    await shop.getByRole("button", { name: "Teach a new task" }).click();
    await site.fill('[data-test="search-query"]', "hammer");
    await site.click('[data-test="search-submit"]');
    await site.waitForTimeout(2000);
    await site.locator("a.card").nth(1).click();
    await site.locator('[data-test="add-to-cart"]').click();
    await site.waitForTimeout(2000);
    const recordedCart = await cartCount();
    await shop.getByRole("button", { name: "I'm done" }).click();
    await shop.getByRole("heading", { name: "Check your task" }).waitFor();
    const steps = (await shop.locator(".step-list > li > .check label").allTextContents()).map((t) => t.trim());
    check("toolshop: review lists the steps in plain words", steps.length === 4 && steps[0] === "Fill in Search" && steps[2] === "Click a result" && /Add to cart/.test(steps[3]), steps.join(" → "));
    check("toolshop: clicked product defaults to 'the first result'", (await shop.getByLabel(/Which item to click/).inputValue()) === "first");
    await shop.getByRole("button", { name: "Save task" }).click();
    await shop.getByRole("button", { name: "Run", exact: true }).waitFor();
    check("toolshop: background run not offered (it would only search)", await shop.getByText("Runs on the page, step by step").isVisible());

    await shop.getByLabel("Search", { exact: true }).fill("pliers");
    const runStarted = Date.now();
    await shop.getByRole("button", { name: "Run", exact: true }).click();
    const shopResult = await shop.locator(".result").textContent({ timeout: 90_000 });
    const runSeconds = ((Date.now() - runStarted) / 1000).toFixed(1);
    const done = await shop.locator(".progress-steps .done").count();
    await site.waitForTimeout(1500);
    const title = await site.locator('[data-test="product-name"]').textContent().catch(() => "");
    await shop.screenshot({ path: path.join(ROOT, "test/e2e/toolshop.png"), fullPage: true });
    check("toolshop: run searched 'pliers', opened the first result and added it — visibly, on the page", /pliers/i.test(title) && (await cartCount()) === recordedCart + 1, `"${title.trim()}" · cart ${recordedCart} → ${await cartCount()} · ${done} steps in ${runSeconds}s · ${shopResult.trim().split("\n")[0]}`);

    // ---- Shady Meadows B&B (live): book a room, then many guests from a messy spreadsheet; contact form ----
    const BNB = "https://automationintesting.online";
    const day = (offset) => new Date(Date.UTC(2027, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
    const base = 30 + Math.floor(Math.random() * 600); // random far-future dates: the site is shared with other testers
    const dmy = (iso) => iso.split("-").reverse().join("/");
    await site.goto(`${BNB}/reservation/2?checkin=${day(base)}&checkout=${day(base + 1)}`, { waitUntil: "networkidle" });
    const bnb = await openPanel();
    await bnb.getByRole("button", { name: "Teach a new task" }).click();
    await site.getByRole("button", { name: "Reserve Now" }).click();
    for (const [field, value] of [["Firstname", "Aarav"], ["Lastname", "Sharma"], ["Email", "aarav@example.com"], ["Phone", "+919810012345"]]) {
      await site.getByPlaceholder(field).click();
      await site.keyboard.type(value, { delay: 25 });
    }
    await site.getByRole("button", { name: "Reserve Now" }).click();
    await site.getByText("Booking Confirmed").waitFor();
    await bnb.getByRole("button", { name: "I'm done" }).click();
    await bnb.getByRole("heading", { name: "Check your task" }).waitFor();
    const bnbInputs = await askedFields(bnb);
    check("b&b: asks for the guest details and the dates from the page address", ["Firstname", "Lastname", "Email", "Phone", "Checkin", "Checkout"].every((l) => bnbInputs.includes(l)), bnbInputs.join(", "));
    await bnb.getByRole("button", { name: "Save task" }).click();
    await bnb.getByRole("button", { name: "Run", exact: true }).waitFor();

    await bnb.getByLabel("Firstname", { exact: true }).fill("Priya");
    await bnb.getByLabel("Checkin", { exact: true }).fill(day(base + 3));
    await bnb.getByLabel("Checkout", { exact: true }).fill(day(base + 4));
    await bnb.getByRole("button", { name: "Run", exact: true }).click();
    const bnbRun = await bnb.locator(".result").textContent({ timeout: 90_000 });
    const confirmed = await site.getByText(`${day(base + 3)} - ${day(base + 4)}`).isVisible().catch(() => false);
    check("b&b: run on page opens the room for the new dates and books it", confirmed && site.url().includes(`checkin=${day(base + 3)}`), `${bnbRun.trim().split("\n")[0]} · page shows ${day(base + 3)} - ${day(base + 4)}: ${confirmed}`);

    // A messy paste: semicolons, different header names, day-first dates, a blank line, one invalid guest.
    const sheet = [
      "First name;Last name;Email address;Phone number;Check-in;Check-out",
      `Rohan;Mehta;rohan@example.com;+919830034567;${dmy(day(base + 6))};${dmy(day(base + 7))}`,
      "",
      `Ananya;Iyer;ananya@example.com;+919840045678;${dmy(day(base + 9))};${dmy(day(base + 10))}`,
      `Vik;Li;vik@example.com;+919850056789;${dmy(day(base + 12))};${dmy(day(base + 13))}`,
    ].join("\n");
    await bnb.getByRole("button", { name: "Run from a spreadsheet" }).click();
    await bnb.getByLabel("Rows").fill(sheet);
    await bnb.getByText("3 rows ready.").waitFor();
    const unmatched = await bnb.getByText(/Not in your sheet|Ignored columns/).count();
    check("b&b: messy headers still match every field", unmatched === 0);
    await bnb.getByRole("button", { name: "Run 3 rows" }).click();
    await bnb.getByRole("button", { name: "Yes, run 3 times" }).click();
    await bnb.getByText(/succeeded · \d+ failed/).waitFor({ timeout: 120_000 });
    const bnbSummary = await bnb.locator(".summary").textContent();
    const bnbError = await bnb.locator(".sheet tr.error .status-cell").allTextContents();
    check("b&b: 2 guests booked, the 2-letter last name rejected with the site's reason", bnbSummary === "2 succeeded · 1 failed", `${bnbSummary} — ${bnbError.join(" | ")}`);
    await bnb.screenshot({ path: path.join(ROOT, "test/e2e/bnb.png"), fullPage: true });

    await site.goto(BNB, { waitUntil: "networkidle" });
    const contact = await openPanel();
    await contact.getByRole("button", { name: "Teach a new task" }).click();
    for (const [selector, value] of [["#name", "Kuldeep"], ["#email", "k@example.com"], ["#phone", "+919810012345"], ["#subject", "Late check-in request"], ["#description", "Hi, we will arrive around 9 PM. Is late check-in possible?"]]) {
      await site.click(selector);
      await site.keyboard.type(value, { delay: 10 });
    }
    await site.getByRole("button", { name: "Submit" }).click();
    await site.getByText(/Thanks for getting in touch/).waitFor();
    await contact.getByRole("button", { name: "I'm done" }).click();
    await contact.getByRole("button", { name: "Save task" }).click();
    await contact.getByRole("button", { name: "Run", exact: true }).waitFor();
    await contact.getByLabel("Name", { exact: true }).fill("Meera Pillai");
    await contact.getByRole("button", { name: "Run", exact: true }).click();
    await contact.locator(".result").waitFor({ timeout: 90_000 });
    check("contact: run on page sends a new message under the new name", await site.getByText("Thanks for getting in touch Meera Pillai!").isVisible().catch(() => false));
    const canBackground = await contact.getByLabel("In the background").count();
    if (canBackground) {
      await contact.getByLabel("Name", { exact: true }).fill("Arjun Reddy");
      await contact.getByLabel("In the background").check();
      await contact.getByRole("button", { name: "Run again" }).click();
      const bgContact = await contact.locator(".result").last().textContent();
      check("contact: background run sends it too", /✓/.test(bgContact), bgContact.trim().split("\n")[0]);
    } else check("contact: background run offered for a single form", false);
  } finally {
    await context.close();
    server.kill();
  }

  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
