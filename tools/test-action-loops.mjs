import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = new URL('../.tmp/action-loops/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text());
});
try {
  await page.goto('http://127.0.0.1:8793/index.html?build=action-loops-v3');
  await page.waitForFunction(() => typeof wallMarqueeCards !== 'undefined'
    && wallMarqueeCards.length === 16 && wallMarqueeCards.every(c => c.source.userData.ready));
  await page.evaluate(() => {
    renderer.setAnimationLoop(null);
    scene.getObjectByName('retro-spatial-game-ui').visible = false;
    rig.visible = true;
    updateWallMarquee(7);
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', out)) });
  const results = await page.evaluate(() => {
    const adjacent = WALL_MARQUEE_PERSON_ORDER.some((person, index, order) => person === order[(index + 1) % order.length]);
    const mirrored = WALL_MARQUEE_PERSON_ORDER.slice(0, 8).every((person, index) => person === WALL_MARQUEE_PERSON_ORDER[15 - index]);
    if (adjacent || mirrored) throw new Error('Marquee order still contains duplicate or mirrored neighbors');
    const testScene = new THREE.Scene();
    const testCamera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 5);
    testCamera.position.z = 1;
    renderer.setPixelRatio(1);
    renderer.setSize(800, 450, false);
    const gl = renderer.getContext();
    const results = [];
    function pixels() {
      renderer.render(testScene, testCamera);
      const data = new Uint8Array(800 * 450 * 4);
      gl.readPixels(0, 0, 800, 450, gl.RGBA, gl.UNSIGNED_BYTE, data);
      return data;
    }
    for (const card of wallMarqueeCards.slice(0, 8)) {
      const material = card.action.material.clone();
      material.clippingPlanes = [];
      material.fog = false;
      const mesh = new THREE.Mesh(card.action.geometry, material);
      testScene.add(mesh);
      const durations = WALL_MARQUEE_ACTIONS[card.personIndex].seconds;
      const cycle = durations.reduce((a, b) => a + b, 0);
      const start = cycle * 10 - card.phase * 7.3 + 0.01;
      const frames = [], samples = [];
      let elapsed = 0;
      for (let frame = 0; frame < 4; frame++) {
        updateWallMarqueeAction(card, start + elapsed);
        frames.push(card.frame);
        samples.push(pixels());
        elapsed += durations[frame];
      }
      updateWallMarqueeAction(card, start + cycle);
      const repeat = pixels();
      let changed = 0, nonblack = 0, loopError = 0;
      for (let p = 0; p < repeat.length; p += 4) {
        if (Math.abs(samples[0][p] - samples[2][p]) + Math.abs(samples[0][p+1] - samples[2][p+1]) > 20) changed++;
        if (repeat[p] + repeat[p+1] + repeat[p+2] > 30) nonblack++;
        if (repeat[p] !== samples[0][p] || repeat[p+1] !== samples[0][p+1] || repeat[p+2] !== samples[0][p+2]) loopError++;
      }
      results.push({ person: card.personIndex + 1, frames, changed, nonblack, loopError,
        fallback: !!card.source.userData.fallback, vertices: card.action.geometry.attributes.position.count });
      testScene.remove(mesh);
      material.dispose();
    }
    updateWallMarquee(7);
    return results;
  });
  for (const r of results) {
    assert.deepEqual(r.frames, [0, 1, 2, 3]);
    assert(r.changed > 10000 && r.nonblack > 10000);
    assert.equal(r.loopError, 0);
    assert.equal(r.fallback, false);
    assert.equal(r.vertices, 4);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', out)) });
  assert.deepEqual(errors, []);
  fs.writeFileSync(new URL('results.json', out), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
