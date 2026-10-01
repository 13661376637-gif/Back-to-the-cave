import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = new URL('../.tmp/cone-beam/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
});

try {
  await page.goto('http://127.0.0.1:8793/index.html?build=cone-beam-v2');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame && window.__caveVR?.sphere);
  const metrics = await page.evaluate(async () => {
    const bridge = window.__caveVR;
    const ui = bridge.scene.getObjectByName('retro-spatial-game-ui');
    const beam = bridge.scene.getObjectByName('flashlight-cone-beam');
    const core = bridge.scene.getObjectByName('flashlight-cone-core');
    const beamGroup = bridge.scene.getObjectByName('flashlight-cone-group');
    const spot = bridge.scene.getObjectByName('flashlight-wall-spot');
    const flashlight = bridge.scene.getObjectByName('low-poly-flashlight');
    bridge.renderer.setAnimationLoop(null);
    ui.visible = false;
    bridge.rig.visible = true;
    bridge.sphere.world.visible = true;
    const levels = [];
    for (let index = 0; index < 4; index++) {
      bridge.photoRevealGame.startLevel(index);
      await new Promise(resolve => setTimeout(resolve, 80));
      bridge.sphere.setLightEnabled(true);
      bridge.sphere.setRotation(-0.12, 0.36);
      bridge.scene.updateMatrixWorld(true);
      const worldScale = flashlight.getWorldScale(new THREE.Vector3()).x;
      levels.push({
        radius: bridge.photoRevealGame.levels[index].flashRadius,
        beamFarRadius: beam.scale.x * worldScale,
        coreFarRadius: core.scale.x * worldScale,
        spotRadius: spot.scale.x * 0.42,
        beamVisible: beam.visible,
        spotVisible: spot.visible,
      });
    }
    bridge.photoRevealGame.startLevel(0);
    await new Promise(resolve => setTimeout(resolve, 80));
    bridge.sphere.setLightEnabled(true);
    bridge.sphere.setRotation(-0.12, 0.36);
    bridge.renderer.render(bridge.scene, bridge.camera);
    const geometry = beam.geometry.parameters;
    bridge.photoRevealGame.handleTriggerUp();
    return { levels, geometry, hiddenAfterRelease: !beamGroup.visible && !spot.visible };
  });
  assert.equal(metrics.geometry.radiusTop, 0.018);
  assert.equal(metrics.geometry.radiusBottom, 1);
  metrics.levels.forEach((level, index) => {
    const expected = level.radius * 9.65;
    assert(Math.abs(level.beamFarRadius - expected) < 0.002, `level ${index + 1} beam radius`);
    assert(Math.abs(level.spotRadius - expected) < 0.002, `level ${index + 1} spot radius`);
    assert(level.beamVisible && level.spotVisible, `level ${index + 1} visibility`);
  });
  assert(metrics.levels.every((level, index, list) => index === 0 || level.beamFarRadius < list[index - 1].beamFarRadius));
  assert(metrics.hiddenAfterRelease);
  assert.deepEqual(errors, []);
  await page.evaluate(() => {
    const bridge = window.__caveVR;
    bridge.sphere.setLightEnabled(true);
    bridge.sphere.setRotation(-0.12, 0.36);
    bridge.renderer.render(bridge.scene, bridge.camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', out)) });
  await page.evaluate(() => {
    const bridge = window.__caveVR;
    bridge.camera.position.set(3.8, 1.1, 7.8);
    bridge.camera.lookAt(0, -1.1, -4.5);
    bridge.camera.updateMatrixWorld(true);
    bridge.renderer.render(bridge.scene, bridge.camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('side-view.png', out)) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.__caveVR.renderer.render(window.__caveVR.scene, window.__caveVR.camera);
  });
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', out)) });
  fs.writeFileSync(new URL('results.json', out), JSON.stringify({ metrics, errors }, null, 2));
  console.log(JSON.stringify({ metrics, errors }, null, 2));
} finally {
  await browser.close();
}
