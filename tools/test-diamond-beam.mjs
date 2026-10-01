import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = new URL('../.tmp/diamond-beam/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
});

try {
  await page.goto('http://127.0.0.1:8794/index.html?build=diamond-beam-v5');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame && window.__caveVR?.sphere);
  const metrics = await page.evaluate(async () => {
    const bridge = window.__caveVR;
    const ui = bridge.scene.getObjectByName('retro-spatial-game-ui');
    const beam = bridge.scene.getObjectByName('flashlight-diamond-beam');
    const core = bridge.scene.getObjectByName('flashlight-cone-core');
    const beamGroup = bridge.scene.getObjectByName('flashlight-cone-group');
    const hardSpot = bridge.scene.getObjectByName('flashlight-wall-spot');
    bridge.renderer.setAnimationLoop(null);
    ui.visible = false;
    bridge.rig.visible = true;
    bridge.sphere.world.visible = true;

    const levels = [];
    const wallZ = (bridge.centerWallZ || -8) + (bridge.rig?.position.z || 0);
    for (let index = 0; index < 4; index++) {
      bridge.photoRevealGame.startLevel(index);
      await new Promise(resolve => setTimeout(resolve, 80));
      const target = new THREE.Vector3(-1.2 + index * 0.75, -0.8 + index * 0.2, wallZ);
      bridge.sphere.setRevealTarget(target);
      bridge.sphere.setLightEnabled(true);
      bridge.sphere.setRotation(-0.12, 0.36);
      bridge.scene.updateMatrixWorld(true);
      const farCenter = beam.localToWorld(new THREE.Vector3(0, -0.5, 0));
      levels.push({
        radius: bridge.photoRevealGame.levels[index].flashRadius,
        beamFarRadius: beam.scale.x,
        endpointError: farCenter.distanceTo(target),
        beamVisible: beam.visible,
      });
    }

    const geometry = beam.geometry.parameters;
    bridge.photoRevealGame.handleTriggerUp();
    return {
      levels,
      geometry,
      beamLocalRotationY: beam.rotation.y,
      usesFeatherShader: beam.material.isShaderMaterial && Boolean(beam.material.uniforms?.beamOpacity),
      coreExists: Boolean(core),
      hardSpotExists: Boolean(hardSpot),
      hiddenAfterRelease: !beamGroup.visible,
    };
  });

  assert.equal(metrics.geometry.radiusTop, 0.018);
  assert.equal(metrics.geometry.radiusBottom, 1);
  assert.equal(metrics.geometry.radialSegments, 4);
  assert.equal(metrics.geometry.openEnded, true);
  assert.equal(metrics.beamLocalRotationY, 0);
  assert.equal(metrics.usesFeatherShader, true);
  assert.equal(metrics.coreExists, false);
  assert.equal(metrics.hardSpotExists, false);
  metrics.levels.forEach((level, index) => {
    const expected = level.radius * 9.65;
    assert(Math.abs(level.beamFarRadius - expected) < 0.002, `level ${index + 1} beam radius`);
    assert(level.endpointError < 0.002, `level ${index + 1} endpoint synchronization`);
    assert(level.beamVisible, `level ${index + 1} visibility`);
  });
  assert(metrics.levels.every((level, index, list) => index === 0 || level.beamFarRadius < list[index - 1].beamFarRadius));
  assert(metrics.hiddenAfterRelease);
  assert.deepEqual(errors, []);

  await page.evaluate(() => {
    const bridge = window.__caveVR;
    const wallZ = (bridge.centerWallZ || -8) + (bridge.rig?.position.z || 0);
    bridge.sphere.setRevealTarget(new THREE.Vector3(1.2, -0.6, wallZ));
    bridge.sphere.setLightEnabled(true);
    bridge.sphere.setRotation(-0.16, 0.52);
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
  fs.writeFileSync(new URL('results.json', out), JSON.stringify({ metrics, errors }, null, 2));
  console.log(JSON.stringify({ metrics, errors }, null, 2));
} finally {
  await browser.close();
}
