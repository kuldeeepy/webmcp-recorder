// Measures page-load cost of the extension: same pages, with and without it, alternating runs.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "../../dist");
const CHROME = process.env.WMR_CHROME || `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const PAGES = ["https://en.wikipedia.org/wiki/India", "https://practicesoftwaretesting.com/", "https://automationexercise.com/", "https://github.com/trending"];
const RUNS = 4;

const launch = (withExtension) => chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), "perf-")), {
  executablePath: CHROME, headless: true,
  args: withExtension ? [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`] : [],
});

async function measure(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  const timing = await page.evaluate(() => {
    const [nav] = performance.getEntriesByType("navigation");
    return { dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, heap: performance.memory?.usedJSHeapSize };
  });
  await page.close();
  return timing;
}

const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const plain = await launch(false), withExt = await launch(true);
console.log("page".padEnd(42), "load ms (plain → ext)".padEnd(26), "DOMContentLoaded ms (plain → ext)");
for (const url of PAGES) {
  const a = [], b = [];
  await measure(plain, url); await measure(withExt, url); // warm caches
  for (let i = 0; i < RUNS; i++) { a.push(await measure(plain, url)); b.push(await measure(withExt, url)); }
  const m = (xs, key) => Math.round(median(xs.map((x) => x[key])));
  console.log(url.replace("https://", "").slice(0, 40).padEnd(42), `${m(a, "load")} → ${m(b, "load")}`.padEnd(26), `${m(a, "dcl")} → ${m(b, "dcl")}`);
}
await plain.close(); await withExt.close();
