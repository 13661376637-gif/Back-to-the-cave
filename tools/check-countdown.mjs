import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = new URL('../.tmp/countdown/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8794/index.html?build=countdown-digits-v1');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame);
  await page.evaluate(async () => {
    const b = window.__caveVR;
    b.renderer.setAnimationLoop(null);
    b.scene.getObjectByName('retro-spatial-game-ui').visible = false;
    b.rig.visible = true;
    b.photoRevealGame.startLevel(1);
    const controller = new THREE.Group();
    controller.position.copy(b.camera.position);
    b.scene.add(controller);
    b.photoRevealGame.bindController(controller);
    await document.fonts.ready;
  });
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'ready');
  await page.evaluate(() => {
    const b = window.__caveVR;
    b.photoRevealGame.handleTriggerDown();
    window.countdownCheckLoop = setInterval(() => {
      b.frameCallbacks.forEach(callback => callback(performance.now()));
      b.renderer.render(b.scene, b.camera);
    }, 30);
  });
  const results = [];
  for (const seconds of [3, 2, 1]) {
    await page.waitForFunction(n => {
      const digit = window.__caveVR.scene.getObjectByName('photo-countdown-digit');
      return digit.userData.seconds === n && digit.position.z === -3;
    }, seconds);
    results.push(await page.evaluate(() => {
      const b = window.__caveVR;
      const digit = b.scene.getObjectByName('photo-countdown-digit');
      const ndc = digit.getWorldPosition(new THREE.Vector3()).project(b.camera);
      const rgba = digit.userData.canvas.getContext('2d').getImageData(0, 0, 256, 256).data;
      return { seconds: digit.userData.seconds, visible: digit.visible, x: ndc.x, y: ndc.y, nonblank: rgba.some((v, i) => i % 4 === 3 && v > 0) };
    }));
    await page.screenshot({ path: fileURLToPath(new URL(`digit-${seconds}.png`, out)) });
  }
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'question');
  assert.equal(await page.evaluate(() => window.__caveVR.scene.getObjectByName('photo-countdown-digit').visible), false);
  for (const r of results) { assert(r.visible && r.nonblank); assert(Math.abs(r.x) < 0.001); assert(r.y > 0.65 && r.y < 0.85); }
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const b = window.__caveVR;
    b.photoRevealGame.startLevel(0);
  });
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'ready');
  await page.evaluate(() => window.__caveVR.photoRevealGame.handleTriggerDown());
  await page.waitForFunction(() => window.__caveVR.scene.getObjectByName('photo-countdown-digit').visible);
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', out)) });
  console.log(JSON.stringify({ results, errors, hidesOnQuestion: true }));
} finally { await browser.close(); }
