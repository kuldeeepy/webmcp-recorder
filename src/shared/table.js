// Reads rows pasted from Excel, Google Sheets, Numbers or a CSV file, and lines them up with a task's inputs.
import { looseKey } from "./text.js";

const DELIMITERS = ["\t", ",", ";", "|"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function tidy(text) {
  return text
    .replace(/^﻿/, "") // byte-order mark Excel adds to CSV files
    .replace(/\r\n?/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ");
}

// Splits text into records, honouring quotes (which may contain the delimiter or line breaks).
function splitRecords(source, delimiter) {
  const records = [];
  let record = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (char === delimiter) { record.push(cell); cell = ""; }
    else if (char === "\n") { record.push(cell); records.push(record); record = []; cell = ""; }
    else cell += char;
  }
  record.push(cell);
  records.push(record);
  return records.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

// The delimiter that splits the lines into the same, largest number of columns.
function detectDelimiter(source) {
  const lines = source.split("\n").filter((l) => l.trim()).slice(0, 20).join("\n");
  let best = { delimiter: ",", score: -1 };
  for (const delimiter of DELIMITERS) {
    const counts = splitRecords(lines, delimiter).map((r) => r.length);
    const columns = Math.max(...counts);
    if (columns < 2) continue;
    const consistent = counts.filter((c) => c === columns).length / counts.length;
    const score = consistent * 10 + columns + (delimiter === "\t" ? 0.5 : 0);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

export function parseTable(text) {
  const source = tidy(text);
  if (!source.trim()) return { headers: [], rows: [] };
  const [headers, ...rows] = splitRecords(source, detectDelimiter(source));
  return { headers, rows };
}

const exactly = (header, input) => [looseKey(input.label), looseKey(input.id)].includes(looseKey(header));

// "Email address" ≈ "Email", "First name" ≈ "Firstname".
function roughly(header, input) {
  const h = looseKey(header);
  return !!h && [looseKey(input.label), looseKey(input.id)].some((n) => n.length >= 4 && (h.includes(n) || n.includes(h)));
}

// Maps each input to a column. Without a recognisable header but one column per input, columns are taken in order.
export function mapColumns(headers, inputs) {
  const columns = {};
  const used = new Set();
  for (const matches of [exactly, roughly]) {
    for (const input of inputs.filter((i) => !(i.id in columns))) {
      const index = headers.findIndex((header, i) => !used.has(i) && matches(header, input));
      if (index !== -1) { columns[input.id] = index; used.add(index); }
    }
  }
  if (!used.size && inputs.length > 0 && headers.length === inputs.length) {
    return { columns: Object.fromEntries(inputs.map((input, i) => [input.id, i])), ignored: [], missing: [], headerless: true };
  }
  return { columns, ignored: headers.filter((_, i) => !used.has(i)), missing: inputs.filter((i) => !(i.id in columns)), headerless: false };
}

// "11/10/2026", "2026/10/11", "11 Oct 2026" → "2026-10-11". Day-first unless the numbers say otherwise.
export function toIsoDate(value) {
  const text = String(value).trim();
  const pad = (n) => String(n).padStart(2, "0");
  let match = text.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (match) return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (match) {
    const [a, b, year] = match.slice(1).map(Number);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  match = text.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  const month = match && MONTHS.indexOf(match[2].toLowerCase());
  if (match && month !== -1) return `${match[3]}-${pad(month + 1)}-${pad(match[1])}`;
  return text;
}

function normalizeValue(value, input) {
  if (value === undefined) return input.example;
  if (input.type === "date") return toIsoDate(value);
  if (input.type === "number" || typeof input.example === "number") return String(value).replace(/[,\s₹$€£]/g, "");
  return value;
}

export function rowValues(row, columns, inputs) {
  return Object.fromEntries(inputs.map((input) => [input.id, normalizeValue(input.id in columns ? row[columns[input.id]] : undefined, input)]));
}

// Row numbers whose cell count doesn't match the header: worth a warning before running.
export const unevenRows = (table) => table.rows.map((row, i) => (row.length !== table.headers.length ? i + 1 : null)).filter(Boolean);
