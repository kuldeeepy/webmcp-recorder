// A dot-matrix mark for the empty state: dots drift away from the cursor and spring back.
const CELL = 6;
const RADIUS = 46;

export function dotLogo(text = "WMR") {
  const canvas = document.createElement("canvas");
  canvas.className = "dot-logo";
  canvas.setAttribute("aria-hidden", "true");
  const width = 300, height = 92, scale = devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  // Sample the word's pixels into a grid of characters, darker → denser glyph.
  const probe = new OffscreenCanvas(width, height).getContext("2d");
  probe.font = "800 78px system-ui, sans-serif";
  probe.textAlign = "center";
  probe.textBaseline = "middle";
  probe.fillText(text, width / 2, height / 2 + 4);
  const pixels = probe.getImageData(0, 0, width, height).data;
  const cells = [];
  for (let y = 0; y < height; y += CELL) {
    for (let x = 0; x < width; x += CELL) {
      const alpha = pixels[(y * width + x) * 4 + 3] / 255;
      if (alpha > 0.15) cells.push({ hx: x, hy: y, x, y, vx: 0, vy: 0, size: 0.8 + alpha * 1.6 });
    }
  }

  const color = () => getComputedStyle(canvas).color;
  const mouse = { x: -999, y: -999 };
  canvas.addEventListener("mousemove", (e) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener("mouseleave", () => { mouse.x = mouse.y = -999; });

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color();
    ctx.beginPath();
    for (const c of cells) {
      ctx.moveTo(c.x + c.size, c.y);
      ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tick = () => {
    if (!canvas.isConnected) return; // stop when the view changes
    for (const c of cells) {
      const dx = c.x - mouse.x, dy = c.y - mouse.y, dist = Math.hypot(dx, dy);
      if (dist < RADIUS && dist > 0) { c.vx += (dx / dist) * (RADIUS - dist) * 0.06; c.vy += (dy / dist) * (RADIUS - dist) * 0.06; }
      c.vx += (c.hx - c.x) * 0.08; // spring home
      c.vy += (c.hy - c.y) * 0.08;
      c.vx *= 0.78;
      c.vy *= 0.78;
      c.x += c.vx;
      c.y += c.vy;
    }
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(still ? draw : tick);
  return canvas;
}
