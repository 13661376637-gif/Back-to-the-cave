import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });

try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8795/index.html?build=standing-173-v1');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame && window.__caveVR?.gameUI);

  const result = await page.evaluate(async () => {
    const bridge = window.__caveVR;
    const stage = document.querySelector('#stage');
    const head = new THREE.PerspectiveCamera(80, 1, 0.1, 95);
    head.position.set(0, 1.61, 0);
    head.rotation.z = THREE.MathUtils.degToRad(12);
    head.updateMatrixWorld(true);

    const originalGetCamera = bridge.renderer.xr.getCamera;
    bridge.renderer.xr.getCamera = () => head;
    bridge.renderer.xr.isPresenting = true;
    bridge.xrSessionActive = true;

    const ray = new THREE.Group();
    ray.position.copy(head.position);
    bridge.scene.add(ray);
    bridge.photoRevealGame.bindController(ray);

    await new Promise((resolve) => setTimeout(resolve, 180));
    const menu = bridge.scene.getObjectByName('retro-spatial-game-ui');
    const standing = {
      config: { ...bridge.xrComfort },
      rigY: bridge.rig.position.y,
      menuY: menu.position.y,
      menuRoll: menu.rotation.z,
    };

    bridge.gameUI.handleTriggerDown = bridge.gameUI.handleTriggerDown;
    bridge.photoRevealGame.setUiBlocked(false);
    bridge.photoRevealGame.startLevel(0);
    await new Promise((resolve) => {
      const check = () => stage.dataset.photoGamePhase === 'ready' ? resolve() : setTimeout(check, 20);
      check();
    });

    bridge.photoRevealGame.handleTriggerDown();
    await new Promise((resolve) => setTimeout(resolve, 3150));
    const answer = bridge.scene.getObjectByName('photo-answer-panel');
    const question = {
      phase: stage.dataset.photoGamePhase,
      visible: answer.visible,
      y: answer.position.y,
      z: answer.position.z,
      roll: answer.rotation.z,
    };

    bridge.renderer.xr.isPresenting = false;
    bridge.xrSessionActive = false;
    bridge.renderer.xr.getCamera = originalGetCamera;
    return { standing, question };
  });

  assert.equal(result.standing.config.userHeight, 1.73);
  assert.equal(result.standing.config.eyeHeight, 1.61);
  assert(Math.abs(result.standing.rigY - 1.61) < 0.001);
  assert(Math.abs(result.standing.menuY - 1.53) < 0.001);
  assert(Math.abs(result.standing.menuRoll - Math.PI / 15) < 0.001);
  assert.equal(result.question.phase, 'question');
  assert.equal(result.question.visible, true);
  assert(Math.abs(result.question.y - 1.53) < 0.001);
  assert(Math.abs(result.question.z + 3.25) < 0.001);
  assert(Math.abs(result.question.roll - Math.PI / 15) < 0.001);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
