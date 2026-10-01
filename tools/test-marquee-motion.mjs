import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const output = new URL('../.tmp/marquee-motion/', import.meta.url);
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
    errors.push(`${message.text()} ${message.location().url}`);
  }
});
try {
  await page.goto('http://127.0.0.1:8793/index.html?build=natural-motion-v1');
  await page.waitForFunction(() => typeof wallMarqueeCards !== 'undefined'
    && wallMarqueeCards.every(card => card.base.material.map.image?.complete
      && card.reaction.material.map.image?.complete));
  await page.evaluate(() => {
    renderer.setAnimationLoop(null);
    scene.getObjectByName('retro-spatial-game-ui').visible = false;
    rig.visible = true;
    updateWallMarquee(7);
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', output)) });
  const motion = await page.evaluate(() => {
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
      const material = card.base.material.clone();
      material.onBeforeCompile = card.base.material.onBeforeCompile;
      material.customProgramCacheKey = card.base.material.customProgramCacheKey;
      material.opacity = 1;
      material.fog = false;
      material.clippingPlanes = [];
      const mesh = new THREE.Mesh(card.base.geometry, material);
      testScene.add(mesh);
      updateWallMarquee(0);
      const before = pixels();
      updateWallMarquee(3.2);
      const after = pixels();
      let moving = 0, border = 0, nonblack = 0;
      for (let y = 0; y < 450; y++) for (let x = 0; x < 800; x++) {
        const p = (y * 800 + x) * 4;
        const delta = Math.abs(before[p] - after[p]) + Math.abs(before[p+1] - after[p+1]) + Math.abs(before[p+2] - after[p+2]);
        if (delta > 12) moving++;
        if (delta > 0 && (x < 80 || x >= 720 || y < 20 || y >= 445)) border++;
        if (after[p] + after[p+1] + after[p+2] > 30) nonblack++;
      }
      results.push({ person: card.personIndex + 1, moving, border, nonblack });
      testScene.remove(mesh);
      material.dispose();
    }
    // Return to the real scene for the mobile framing check.
    updateWallMarquee(7);
    return results;
  });
  for (const result of motion) {
    assert(result.moving > 1000, `Person ${result.person}: subject must move`);
    assert.equal(result.border, 0, `Person ${result.person}: image boundary must remain fixed`);
    assert(result.nonblack > 10000, `Person ${result.person}: texture must render`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    renderer.render(scene, camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', output)) });
  assert.deepEqual(errors, [], 'No browser or shader errors');
  fs.writeFileSync(new URL('results.json', output), JSON.stringify({ motion, errors }, null, 2));
  console.log(JSON.stringify({ motion, errors }, null, 2));
} finally {
  await browser.close();
}
