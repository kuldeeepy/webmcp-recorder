// Renders assets/icon.svg to the PNG sizes Chrome needs (public/icons/icon-<size>.png).
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";

const SIZES = [16, 32, 48, 128];
const svg = await readFile("assets/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: process.env.WMR_CHROME || `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log("icons:", SIZES.join(", "));
