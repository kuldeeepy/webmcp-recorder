import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSlots, applyValues } from "../../src/shared/values.js";
import { buildDraft, latestFields } from "../../src/shared/task-builder.js";
import { parseTable, mapColumns, rowValues } from "../../src/shared/table.js";
import { summarizeResponse } from "../../src/shared/result.js";

const invoiceRequest = {
  method: "POST",
  url: "https://portal.test/api/invoices",
  headers: { "content-type": "application/json" },
  secretHeaders: ["authorization"],
  body: JSON.stringify({ vendor: { name: "Sharma Traders", gstin: "07AABCS1429B1Z5" }, amount: 12500, gstRate: 18, source: "web", clientVersion: "3.2.1", _csrf: "abc" }),
  status: 201,
  at: 30,
};
const typed = [
  { kind: "field", key: "vendor", label: "Vendor name", type: "text", value: "Sharma Traders", at: 1 },
  { kind: "field", key: "amount", label: "Amount (₹)", type: "number", value: "12,500", at: 2 },
  { kind: "field", key: "gst", label: "GST rate", type: "select", value: "18", options: [{ value: "18", label: "18%" }], at: 3 },
  { kind: "click", label: "Save invoice", at: 20 },
];

test("extractSlots finds path ids, query params, nested JSON and marks tokens", () => {
  const slots = extractSlots({ ...invoiceRequest, url: "https://portal.test/api/orders/1002/refund?notify=true" });
  assert.deepEqual(slots.find((s) => s.in === "path"), { in: "path", key: "3", hint: "orders id", value: "1002" });
  assert.ok(slots.some((s) => s.in === "query" && s.key === "notify"));
  assert.ok(slots.some((s) => s.key === "vendor.name"));
  assert.equal(slots.find((s) => s.key === "_csrf").token, true);
});

test("applyValues keeps types and handles query strings nested in JSON", () => {
  const request = { method: "POST", url: "https://x.test/1/indexes/q", body: JSON.stringify({ requests: [{ params: "query=webmcp&page=0" }] }) };
  const slot = extractSlots(request).find((s) => s.hint === "query");
  const { body } = applyValues(request, [{ slot, value: "chrome extension" }]);
  assert.equal(JSON.parse(body).requests[0].params, "query=chrome+extension&page=0");

  const amount = extractSlots(invoiceRequest).find((s) => s.key === "amount");
  assert.equal(JSON.parse(applyValues(invoiceRequest, [{ slot: amount, value: "9,999" }]).body).amount, 9999);
});

test("buildDraft picks the request carrying typed values and names inputs after the page's labels", () => {
  const noise = { method: "GET", url: "https://portal.test/api/invoices", headers: {}, body: null, status: 200, at: 40 };
  const draft = buildDraft({ requests: [invoiceRequest, noise], interactions: typed });
  assert.equal(draft.requestIndex, 0);
  assert.equal(draft.title, "Save invoice");
  assert.equal(draft.name, "save_invoice");
  assert.equal(draft.risky, true);
  assert.equal(draft.matchedBy, "typed");
  assert.deepEqual(draft.inputs.map((i) => i.label), ["Vendor name", "Amount (₹)", "GST rate"]);
  assert.ok(!draft.inputs.some((i) => /source|clientVersion/.test(i.slot.key)), "technical values stay hidden");
  assert.equal(JSON.parse(draft.request.body)._csrf, "", "tokens are never stored");
});

test("buildDraft falls back to request values when nothing typed matches", () => {
  const search = { method: "GET", url: "https://wiki.test/w/rest.php/v1/search/title?q=Delhi&limit=10", headers: {}, body: null, status: 200, at: 5 };
  const draft = buildDraft({ requests: [search], interactions: [] });
  assert.equal(draft.matchedBy, "guessed");
  assert.equal(draft.risky, false);
  assert.deepEqual(draft.inputs.map((i) => i.id), ["q", "limit"]);
});

test("latestFields keeps the final value of each field and skips empty ones", () => {
  const fields = latestFields([
    { kind: "field", key: "a", label: "A", value: "Ta", at: 1 },
    { kind: "field", key: "a", label: "A", value: "Taj", at: 2 },
    { kind: "field", key: "b", label: "B", value: "", at: 3 },
  ]);
  assert.deepEqual(fields.map((f) => f.value), ["Taj"]);
});

test("parseTable reads pasted sheets and quoted CSV", () => {
  assert.deepEqual(parseTable("Vendor name\tAmount\nA\t1\nB\t2\n").rows, [["A", "1"], ["B", "2"]]);
  const csv = parseTable('Vendor name,Amount\n"Sharma Traders, Delhi",100\n"Say ""hi""",5');
  assert.deepEqual(csv.rows, [["Sharma Traders, Delhi", "100"], ['Say "hi"', "5"]]);
});

test("mapColumns matches headers loosely and fills missing columns from the recording", () => {
  const inputs = [{ id: "vendor_name", label: "Vendor name", example: "X" }, { id: "gst_rate", label: "GST rate", example: "18" }];
  const { columns, missing, ignored } = mapColumns(["VENDOR NAME", "Notes"], inputs);
  assert.deepEqual(columns, { vendor_name: 0 });
  assert.deepEqual(missing.map((i) => i.id), ["gst_rate"]);
  assert.deepEqual(ignored, ["Notes"]);
  assert.deepEqual(rowValues(["Acme", "n/a"], columns, inputs), { vendor_name: "Acme", gst_rate: "18" });
});

test("summarizeResponse prefers the site's own message", () => {
  assert.deepEqual(summarizeResponse(201, '{"message":"Invoice INV-1 saved"}').message, "Invoice INV-1 saved");
  assert.equal(summarizeResponse(409, '{"error":"Invoice INV-1 already exists"}').ok, false);
  assert.equal(summarizeResponse(200, '{"pages":[1,2,3]}').message, "3 results");
  assert.equal(summarizeResponse(500, "oops").message, "The site rejected it (HTTP 500)");
});

test("buildSteps keeps the order of actions and clicks on search results default to 'the first result'", async () => {
  const { buildSteps } = await import("../../src/shared/task-builder.js");
  const card = { tag: "a", label: "Thor Hammer", list: { itemSelector: "a.card", index: 2, targetIsItem: true } };
  const steps = buildSteps([
    { kind: "field", key: "q", label: "Search", value: "hammer", target: { tag: "input" }, at: 1 },
    { kind: "click", label: "Search", target: { tag: "button" }, at: 2 },
    { kind: "click", label: "Thor Hammer", target: card, at: 3 },
    { kind: "click", label: "Add to cart", target: { tag: "button" }, at: 4 },
  ]);
  assert.deepEqual(steps.map((s) => [s.kind, s.label, s.pick]), [["field", "Search", undefined], ["click", "Search", "exact"], ["click", "Thor Hammer", "first"], ["click", "Add to cart", "exact"]]);
});

test("background runs are only offered when the picked request is the last change to data", async () => {
  const { buildDraft, canRunInBackground } = await import("../../src/shared/task-builder.js");
  const interactions = [{ kind: "field", key: "q", label: "Search", value: "hammer", target: { tag: "input" }, at: 1 }, { kind: "click", label: "Add to cart", target: { tag: "button" }, at: 5 }];
  const search = { method: "GET", url: "https://shop.test/products/search?q=hammer", headers: {}, body: null, status: 200, at: 2 };
  const addToCart = { method: "POST", url: "https://shop.test/carts/abc", headers: {}, body: '{"product_id":"p1","quantity":1}', status: 200, at: 6 };
  const shop = buildDraft({ requests: [search, addToCart], interactions });
  assert.equal(shop.request.replayable, false);
  assert.equal(canRunInBackground(shop), false, "search → add to cart must replay on the page");
  assert.equal(shop.risky, true);

  const invoice = buildDraft({ requests: [invoiceRequest], interactions: typed });
  assert.equal(canRunInBackground(invoice), true);
});

test("values in the starting page's address become inputs, linked to the request when it carries them", () => {
  const booking = { method: "POST", url: "https://bnb.test/api/booking", headers: {}, body: JSON.stringify({ roomid: 1, firstname: "Aarav", bookingdates: { checkin: "2026-11-03", checkout: "2026-11-04" } }), status: 201, at: 9 };
  const draft = buildDraft({ requests: [booking], interactions: [{ kind: "field", key: "f", label: "Firstname", value: "Aarav", at: 1 }, { kind: "click", label: "Reserve Now", at: 5 }], startUrl: "https://bnb.test/reservation/1?checkin=2026-11-03&checkout=2026-11-04&utm_source=x" });
  assert.deepEqual(draft.inputs.map((i) => [i.label, i.type, i.source]), [["Firstname", undefined, "field"], ["Checkin", "date", "url"], ["Checkout", "date", "url"]]);
  assert.equal(draft.inputs[1].slot.key, "bookingdates.checkin");
});

test("a paste without a header row uses the columns in order when the count matches", () => {
  const inputs = [{ id: "a", label: "Firstname" }, { id: "b", label: "Lastname" }];
  const { headers } = parseTable("\n\nAarav,Sharma\nPriya,Verma\n");
  assert.deepEqual(headers, ["Aarav", "Sharma"]);
  const mapping = mapColumns(headers, inputs);
  assert.equal(mapping.headerless, true);
  assert.deepEqual(mapping.columns, { a: 0, b: 1 });
});

test("parser copes with real-world pastes", async () => {
  const { toIsoDate } = await import("../../src/shared/table.js");
  const semicolon = parseTable("﻿First name;Email address\r\nAarav;a@x.com\r\n\r\nPriya;p@x.com");
  assert.deepEqual(semicolon, { headers: ["First name", "Email address"], rows: [["Aarav", "a@x.com"], ["Priya", "p@x.com"]] });
  assert.deepEqual(parseTable('Name,Note\n“Sharma, Delhi”,"line one\nline two"').rows, [["Sharma, Delhi", "line one\nline two"]]);
  assert.deepEqual(parseTable("Name|City\nA|Pune").rows, [["A", "Pune"]]);

  const inputs = [{ id: "firstname", label: "Firstname" }, { id: "email", label: "Email" }, { id: "checkin", label: "Checkin", type: "date", example: "2026-10-11" }, { id: "amount", label: "Amount (₹)", type: "number", example: 1 }];
  const { columns, missing } = mapColumns(["First name", "Email address", "Check-in", "Amount"], inputs);
  assert.deepEqual(columns, { firstname: 0, email: 1, checkin: 2, amount: 3 });
  assert.equal(missing.length, 0);
  assert.deepEqual(rowValues(["A", "a@x.com", "03/11/2026", "₹12,500"], columns, inputs), { firstname: "A", email: "a@x.com", checkin: "2026-11-03", amount: "12500" });

  assert.equal(toIsoDate("11/10/2026"), "2026-10-11");
  assert.equal(toIsoDate("10/25/2026"), "2026-10-25", "month-first when the day can't be a month");
  assert.equal(toIsoDate("2026/1/5"), "2026-01-05");
  assert.equal(toIsoDate("3 Nov 2026"), "2026-11-03");
});

test("summarizeResponse shows validation reasons instead of counting them", () => {
  assert.equal(summarizeResponse(400, '{"errors":["size must be between 3 and 30"]}').message, "size must be between 3 and 30");
  assert.equal(summarizeResponse(422, '{"errors":[{"message":"Email is invalid"},{"message":"Phone is required"}]}').message, "Email is invalid; Phone is required");
});

test("failures get a plain-English hint about the likely cause", () => {
  assert.equal(summarizeResponse(409, '{"error":"Failed to create booking"}').message, "Failed to create booking (it clashes with something that already exists, like a booked date or a duplicate)");
  assert.equal(summarizeResponse(201, '{"message":"Saved"}').message, "Saved");
});
