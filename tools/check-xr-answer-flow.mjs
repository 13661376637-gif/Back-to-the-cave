import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8794/index.html?build=countdown-digits-v2');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame);
  await page.evaluate(() => {
    const b = window.__caveVR;
    b.renderer.setAnimationLoop(null);
    b.photoRevealGame.startLevel(0);
  });
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'ready');
  const result = await page.evaluate(async () => {
    const b = window.__caveVR;
    const stage = document.querySelector('#stage');
    const panel = b.scene.getObjectByName('photo-answer-panel');
    const menu = b.scene.getObjectByName('retro-spatial-game-ui');
    menu.position.set(0, 0.12, 4.9); // Reproduce the stale desktop anchor seen on Quest.
    const head = new THREE.PerspectiveCamera(80, 1, 0.1, 95);
    head.position.set(-0.29, 0.42, -0.48);
    head.updateMatrixWorld(true);
    const getCamera = b.renderer.xr.getCamera;
    b.renderer.xr.getCamera = () => head;
    b.renderer.xr.isPresenting = true;
    const ray = new THREE.Group();
    ray.position.copy(head.position);
    b.scene.add(ray);
    b.photoRevealGame.bindController(ray);
    const tick = async (ms) => {
      const end = performance.now() + ms;
      do {
        b.frameCallbacks.forEach(fn => fn(performance.now()));
        await new Promise(resolve => setTimeout(resolve, 20));
      } while (performance.now() < end);
    };
    try {
      b.photoRevealGame.handleTriggerDown();
      await tick(1100);
      b.photoRevealGame.handleTriggerUp(); // Releasing the light must not cancel the question.
      await tick(2050);
      b.scene.updateMatrixWorld(true);
      const buttons = panel.children.filter(c => Number.isInteger(c.userData.answerIndex));
      const raycaster = new THREE.Raycaster();
      const reachable = buttons.map(button => {
        const target = button.getWorldPosition(new THREE.Vector3());
        raycaster.set(head.position, target.sub(head.position).normalize());
        return raycaster.intersectObjects(buttons, false)[0]?.object.userData.answerIndex;
      });
      const question = { phase: stage.dataset.photoGamePhase, visible: panel.visible, position: panel.position.toArray(), quaternion: panel.quaternion.toArray(), reachable };
      const fixedPosition = panel.position.clone();
      head.position.x += 0.2;
      head.updateMatrixWorld(true);
      await tick(50);
      const fixedWhileLooking = panel.position.equals(fixedPosition);
      const target = buttons[0].getWorldPosition(new THREE.Vector3());
      ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), target.sub(ray.position).normalize());
      b.photoRevealGame.handleTriggerDown();
      const selection = stage.dataset.photoGamePhase;
      await tick(1100);
      return { question, fixedWhileLooking, selection, afterCorrect: stage.dataset.photoGamePhase };
    } finally {
      b.renderer.xr.isPresenting = false;
      b.renderer.xr.getCamera = getCamera;
    }
  });
  assert.equal(result.question.phase, 'question');
  assert(result.question.visible);
  assert(Math.abs(result.question.position[2] + 3.73) < 0.001);
  assert.deepEqual(result.question.quaternion, [0, 0, 0, 1]);
  assert.deepEqual(result.question.reachable, [0, 1, 2, 3, 4, 5]);
  assert(result.fixedWhileLooking);
  assert.equal(result.selection, 'selection-feedback');
  assert.equal(result.afterCorrect, 'level-complete');
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
