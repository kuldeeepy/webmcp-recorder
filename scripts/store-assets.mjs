// Composes Chrome Web Store images from the e2e screenshots: 1280×800 screenshots and the 440×280 promo tile.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const SHOTS = [
  { file: "1-teach", title: "Teach a task once", subtitle: "Do it on the site as usual. See the steps in plain words.", page: "review-page", panel: "review" },
  { file: "2-spreadsheet", title: "Run it for every row", subtitle: "Paste or drop a spreadsheet. Live status, retries, results.", page: "sheet-page", panel: "sheet" },
  { file: "3-fix", title: "Site changed? Point at it once", subtitle: "The run asks where the button went, and remembers.", page: "fix-page", panel: "fix", panelAt: "bottom" },
  { file: "4-start", title: "100% local. No account.", subtitle: "Tasks live in your browser. Sign-ins are never stored.", page: "empty-page", panel: "empty" },
];
const image = (name) => `data:image/png;base64,${readFileSync(`test/e2e/${name}.png`).toString("base64")}`;
const icon = image("../../public/icons/icon-128");
const font = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

const screenshot = ({ title, subtitle, page, panel, panelAt = "top" }) => `<body style="margin:0;width:1280px;height:800px;${font};background:linear-gradient(160deg,#eef4ff,#f8f9fb 55%);overflow:hidden">
  <div style="padding:44px 64px 0;display:flex;align-items:center;gap:18px">
    <img src="${icon}" style="width:56px;height:56px">
    <div><div style="font-size:38px;font-weight:700;color:#111827;letter-spacing:-.5px">${title}</div>
    <div style="font-size:19px;color:#4b5563;margin-top:4px">${subtitle}</div></div>
  </div>
  <div style="position:absolute;left:64px;right:64px;top:170px;bottom:-24px;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(17,24,39,.18);display:flex;background:#fff">
    <img src="${image(page)}" style="flex:1;min-width:0;height:100%;object-fit:cover;object-position:left top">
    <img src="${image(panel)}" style="width:330px;height:100%;object-fit:cover;object-position:${panelAt};border-left:1px solid #e5e7eb">
  </div></body>`;

const promo = `<body style="margin:0;width:440px;height:280px;${font};background:linear-gradient(135deg,#4c8dff,#1a56db);color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box">
  <img src="${icon}" style="width:64px;height:64px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))">
  <div style="font-size:30px;font-weight:700;margin-top:14px;letter-spacing:-.3px">WebMCP Recorder</div>
  <div style="font-size:16px;opacity:.9;margin-top:6px">Teach a web task once. Run it for every row.</div></body>`;

mkdirSync("store/screenshots", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.WMR_CHROME || `${homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` });
const render = async (html, width, height, path) => {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.screenshot({ path });
  await page.close();
};
for (const shot of SHOTS) await render(screenshot(shot), 1280, 800, `store/screenshots/${shot.file}.png`);
await render(promo, 440, 280, "store/promo-small.png");
await browser.close();
console.log(`store/screenshots: ${SHOTS.length} · store/promo-small.png`);
