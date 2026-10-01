import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const out = new URL('../.tmp/compact-answer-ui/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1380 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
});

try {
  await page.goto('http://127.0.0.1:8794/index.html?build=compact-answer-v3');
  await page.waitForFunction(() => window.__caveVR?.photoRevealGame);
  const metrics = await page.evaluate(async () => {
    const bridge = window.__caveVR;
    bridge.photoRevealGame.startLevel(1);
    await new Promise(resolve => setTimeout(resolve, 120));
    const mainUi = bridge.scene.getObjectByName('retro-spatial-game-ui');
    const panel = bridge.scene.getObjectByName('photo-answer-panel');
    mainUi.getWorldPosition(panel.position);
    mainUi.getWorldQuaternion(panel.quaternion);
    mainUi.visible = false;
    panel.visible = true;
    bridge.renderer.render(bridge.scene, bridge.camera);

    const surface = panel.children.find(child => child.geometry?.parameters?.width === 1.9);
    const buttons = panel.children.filter(child => Number.isInteger(child.userData?.answerIndex));
    const question = panel.getObjectByName('photo-question-label');
    const label = panel.getObjectByName('photo-answer-label-1');
    return {
      surface: {
        width: surface.geometry.parameters.width,
        height: surface.geometry.parameters.height,
        opacity: surface.material.opacity,
        transparent: surface.material.transparent,
      },
      button: {
        width: buttons[0].geometry.parameters.width,
        height: buttons[0].geometry.parameters.height,
      },
      buttonPositions: buttons.map(button => [button.position.x, button.position.y]),
      questionSize: [question.geometry.parameters.width, question.geometry.parameters.height],
      labelSize: [label.geometry.parameters.width, label.geometry.parameters.height],
    };
  });

  assert.deepEqual(metrics.surface, { width: 1.9, height: 0.78, opacity: 0.2, transparent: true });
  assert.deepEqual(metrics.button, { width: 0.78, height: 0.14 });
  assert.deepEqual(metrics.questionSize, [2.2, 0.14]);
  assert.deepEqual(metrics.labelSize, [1, 0.18]);
  assert.deepEqual(metrics.buttonPositions, [
    [-0.42, 0.17], [0.42, 0.17],
    [-0.42, -0.03], [0.42, -0.03],
    [-0.42, -0.23], [0.42, -0.23],
  ]);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: fileURLToPath(new URL('answer-level-02.png', out)) });
  fs.writeFileSync(new URL('results.json', out), JSON.stringify({ metrics, errors }, null, 2));
  console.log(JSON.stringify({ metrics, errors }, null, 2));
} finally {
  await browser.close();
}
