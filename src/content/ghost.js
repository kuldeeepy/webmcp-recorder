// A visible "ghost" cursor for on-page runs: glides to each element, ripples on click, types character by character.

const Z = 2147483647;
const ACCENT = "#1a73e8";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cursor = null;

function ensureCursor() {
  if (cursor?.isConnected) return cursor;
  cursor = document.createElement("div");
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="${ACCENT}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  cursor.style.cssText = `position:fixed;left:0;top:0;z-index:${Z};pointer-events:none;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3));
    transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .3s;transform:translate(${innerWidth / 2}px,${innerHeight / 2}px);opacity:0`;
  document.documentElement.appendChild(cursor);
  requestAnimationFrame(() => { cursor.style.opacity = "1"; });
  return cursor;
}

export async function glideTo(element) {
  if (reducedMotion()) return;
  const box = element.getBoundingClientRect();
  ensureCursor().style.transform = `translate(${box.left + Math.min(24, box.width / 2)}px,${box.top + box.height / 2}px)`;
  await sleep(450);
}

export function ripple(element) {
  const box = element.getBoundingClientRect();
  const ring = document.createElement("div");
  ring.setAttribute("aria-hidden", "true");
  ring.style.cssText = `position:fixed;left:${box.left - 4}px;top:${box.top - 4}px;width:${box.width + 8}px;height:${box.height + 8}px;
    border:2px solid ${ACCENT};border-radius:8px;pointer-events:none;z-index:${Z - 1};box-shadow:0 0 0 4px rgba(26,115,232,.18);
    transition:transform .5s cubic-bezier(.2,.8,.2,1),opacity .5s;transform:scale(1);opacity:1`;
  document.documentElement.appendChild(ring);
  requestAnimationFrame(() => { ring.style.transform = "scale(1.06)"; ring.style.opacity = "0"; });
  setTimeout(() => ring.remove(), 550);
}

export function hideCursor() {
  if (!cursor) return;
  cursor.style.opacity = "0";
  setTimeout(() => cursor?.remove(), 300);
}

// Types the text one character at a time (each with an input event), capped so long values stay quick.
export async function typeInto(element, text, setValue) {
  if (reducedMotion() || !text || element.tagName === "SELECT") return setValue(text);
  const delay = Math.min(35, 500 / text.length);
  for (let i = 1; i <= text.length; i++) {
    setValue(text.slice(0, i));
    await sleep(delay);
  }
}
