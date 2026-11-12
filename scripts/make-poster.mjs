// Renders a 4:3 poster from the real game: paints a scene through the simulation,
// overlays the title, and crops to 4:3. Needs `npx vite preview --port 4317` running.
// Usage: npm run build && npx vite preview --port 4317, then npm run poster [-- out.png]
import { chromium } from '@playwright/test';
import { ANIMALS } from '../src/content/animals.ts';

const out = process.argv[2] ?? 'marketing/poster.png';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4317/?fresh&seed=12&debug');
await page.click('#play:not([disabled])');
await page.addStyleTag({
  content: `#toolbar, .toast { display: none !important; }
  #poster-title { position: fixed; left: 160px; width: 1600px; top: 0; height: 300px; z-index: 50; pointer-events: none;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
    background: linear-gradient(180deg, rgba(5,3,2,.92) 0%, rgba(5,3,2,.55) 60%, rgba(5,3,2,0) 100%);
    font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif; }
  #poster-title h1 { margin: 0; font-size: 128px; font-weight: normal; letter-spacing: .06em; color: #e0b77c;
    text-shadow: 0 0 40px rgba(255,140,50,.45), 0 3px 0 #000; }
  #poster-title p { margin: 6px 0 0; font-size: 34px; color: #cdb898; letter-spacing: .04em; font-style: italic; }
  #poster-foot { position: fixed; left: 160px; width: 1600px; bottom: 0; height: 120px; z-index: 50; pointer-events: none;
    display: flex; align-items: flex-end; justify-content: center; padding-bottom: 28px;
    background: linear-gradient(0deg, rgba(5,3,2,.85), rgba(5,3,2,0));
    font-family: 'Palatino Linotype', Palatino, Georgia, serif; font-size: 26px; letter-spacing: .12em; color: #a8916c; }`,
});

const animals = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));
await page.evaluate(async (A) => {
  const { sim, game } = window.cave;
  // Place the torch first: particles emitted at its home spot would otherwise linger
  // while the (slow, software-rendered) page draws the painting.
  const scene = game.scene.getScene('cave');
  scene.torch.x = 1290;
  scene.torch.y = 760;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('style', 'position:absolute;width:0;height:0');
  document.body.append(svg);
  const pathEl = (d) => {
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    return p;
  };
  const place = (ox, oy, k) => (x, y) => [ox + x * k, oy + y * k];

  const tracePath = (d, tf, tool, pigment, size, jitter = 0) => {
    const p = pathEl(d);
    const len = p.getTotalLength();
    let last = null;
    let open = false;
    for (let s = 0; s <= len; s += 3) {
      const pt = p.getPointAtLength(s);
      if (last && Math.hypot(pt.x - last.x, pt.y - last.y) > 12) {
        sim.endStroke();
        open = false;
      }
      const [x, y] = tf(pt.x + (Math.random() - 0.5) * jitter, pt.y + (Math.random() - 0.5) * jitter);
      if (!open) {
        sim.beginStroke(tool, pigment, size, x, y, 0.55);
        open = true;
      } else sim.strokeTo(x, y, 0.55 + 0.15 * Math.sin(s / 40));
      last = pt;
    }
    if (open) sim.endStroke();
  };

  const fill = (d, tf, tool, pigment, size, step, region = () => true) => {
    const p = pathEl(d);
    for (let y = 20; y < 250; y += step) {
      let inside = false;
      for (let x = 0; x <= 400; x += 3) {
        const ok = p.isPointInFill(new DOMPoint(x, y)) && region(x, y);
        const [wx, wy] = tf(x, y + Math.sin(x / 30) * 2);
        if (ok && !inside) {
          sim.beginStroke(tool, pigment, size, wx, wy, 0.5);
          inside = true;
        } else if (ok) sim.strokeTo(wx, wy, 0.5);
        else if (inside) {
          sim.endStroke();
          inside = false;
        }
      }
      if (inside) sim.endStroke();
    }
  };

  const stamp = (shape, x, y, angle, sizeMul, pigment, ticks) => {
    sim.beginStamp({ shape, x, y, angle, sizeMul, flip: false }, pigment);
    for (let i = 0; i < ticks; i++) sim.tick();
    sim.endStamp();
  };

  // Hand stencils first, under the animals, like a palimpsest wall.
  stamp('hand', 1330, 300, 0.25, 1.15, 'redOchre', 45);
  stamp('hand', 1220, 360, -0.2, 1.0, 'redOchre', 25);
  stamp('hand', 230, 330, -0.35, 1.05, 'charcoal', 35);
  stamp('shell', 1350, 560, 0.2, 0.9, 'kaolin', 30);

  // Bison: red ochre body with a dark outline.
  const bison = place(720, 300, 1.55);
  fill(A.bison.outline, bison, 'brush', 'redOchre', 1.7, 7);
  fill(A.bison.outline, bison, 'brush', 'umber', 1.5, 9, (x, y) => y < 120 && x > 100 && x < 260);
  tracePath(A.bison.outline, bison, 'lump', 'charcoal', 1.4, 1);
  tracePath(A.bison.details, bison, 'twig', 'charcoal', 1.3);

  // Mammoth: charcoal contour drawing with a manganese hump.
  const mammoth = place(170, 230, 1.45);
  fill(A.mammoth.outline, mammoth, 'brush', 'manganese', 1.4, 11, (x, y) => y < 90);
  tracePath(A.mammoth.outline, mammoth, 'twig', 'charcoal', 1.9, 1);
  tracePath(A.mammoth.details, mammoth, 'twig', 'charcoal', 1.5);

  // Horse: yellow ochre wash, umber outline.
  const horse = place(250, 600, 1.05);
  fill(A.horse.outline, horse, 'finger', 'yellowOchre', 1.2, 10);
  tracePath(A.horse.outline, horse, 'twig', 'umber', 1.5, 1);
  tracePath(A.horse.details, horse, 'twig', 'umber', 1.2);

  // A row of red ochre finger dots, as at Chauvet.
  for (let i = 0; i < 9; i++) {
    const x = 760 + i * 34;
    const y = 840 + Math.sin(i / 1.4) * 12;
    sim.beginStroke('finger', 'redOchre', 1.2, x, y, 0.6);
    sim.strokeTo(x + 1, y + 1, 0.6);
    sim.strokeTo(x + 1.5, y + 2.5, 0.6);
    sim.endStroke();
  }

  const t = document.createElement('div');
  t.id = 'poster-title';
  t.innerHTML = '<h1>Peinture rupestre</h1><p>Une torche, une paroi et les couleurs de la terre</p>';
  const f = document.createElement('div');
  f.id = 'poster-foot';
  f.textContent = 'CAVEPAINTING.PLAY.MAXIMEBF.COM';
  document.body.append(t, f);
}, animals);
// Wait until every dab has been drawn onto the wall.
await page.waitForFunction(
  () => {
    const sc = window.cave.game.scene.getScene('cave');
    return sc.queue.length === 0 && sc.trickle.length === 0;
  },
  null,
  { timeout: 240_000, polling: 1000 },
);
// Old flame particles age with Phaser's capped frame time, so some may still sit at the
// torch's home spot after the slow paint pass: clear them and let the flame re-form.
await page.evaluate(() => {
  const sc = window.cave.game.scene.getScene('cave');
  for (const e of [sc.flames, sc.embers, sc.smoke]) e.killAll();
});
// Software rendering is slow at this size: give the flame ~150 frames to grow back.
const f0 = await page.evaluate(() => window.cave.game.loop.frame);
await page.waitForFunction((f) => window.cave.game.loop.frame > f + 150, f0, { timeout: 120_000, polling: 500 });
await page.screenshot({ timeout: 120_000, path: out, clip: { x: 160, y: 0, width: 1600, height: 1200 } });
console.log(errors.join('\n') || `poster written to ${out}`);
await browser.close();
