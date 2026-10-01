import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, '实机演示截图');
const gameUrl = 'http://127.0.0.1:8795/index.html?build=video-roll-lock-v1-captures';

fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });

try {
  async function loadFreshGame() {
    await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__caveVR?.photoRevealGame && window.__caveVR?.gameUI);
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(220);
  }

  async function capture(name) {
    await page.screenshot({ path: path.join(outputDir, name), type: 'png' });
  }

  async function beginLevel(levelIndex) {
    await loadFreshGame();
    // Use the visible PLAY control so the production UI releases the flashlight.
    await page.mouse.click(800, 565);
    await page.waitForFunction(() => {
      const bridge = window.__caveVR;
      return !bridge.scene.getObjectByName('retro-spatial-game-ui').visible;
    });
    await page.evaluate((index) => {
      const bridge = window.__caveVR;
      if (index > 0) bridge.photoRevealGame.startLevel(index);
      const ray = new THREE.Group();
      const cameraPosition = bridge.camera.getWorldPosition(new THREE.Vector3());
      const wallZ = (bridge.centerWallZ || -8) + (bridge.rig?.position.z || 0);
      // Match the Quest right-hand controller rather than aiming from the viewer origin.
      ray.position.copy(cameraPosition).add(new THREE.Vector3(0.2, -0.42, -0.8));
      ray.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, -0.02, wallZ).sub(ray.position).normalize(),
      );
      bridge.scene.add(ray);
      bridge.__demoCaptureRay = ray;
      bridge.sphere.bindController(ray);
      bridge.photoRevealGame.bindController(ray);
    }, levelIndex);
    await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'ready');
  }

  async function beginFlash() {
    await page.evaluate(() => window.__caveVR.photoRevealGame.handleTriggerDown());
    await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'flashing');
    await page.evaluate(() => {
      const bridge = window.__caveVR;
      bridge.sphere.setLightEnabled(true);
      bridge.sphere.updateControllerAim();
    });
    await page.waitForTimeout(180);
  }

  await loadFreshGame();
  await capture('00-开始界面.png');

  await page.evaluate(() => window.__caveVR.gameUI.showLevels());
  await page.waitForTimeout(120);
  await capture('01-选关界面.png');

  for (let levelIndex = 0; levelIndex < 4; levelIndex += 1) {
    await beginLevel(levelIndex);
    await beginFlash();
    await capture(`0${levelIndex + 2}-第${levelIndex + 1}关-手电筒揭示.png`);
  }

  await beginLevel(0);
  await beginFlash();
  await capture('06-倒计时-3.png');
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'question', { timeout: 6000 });
  await page.waitForTimeout(80);
  await capture('07-答题界面.png');

  await page.evaluate(() => {
    const bridge = window.__caveVR;
    const ray = bridge.__demoCaptureRay;
    const answer = bridge.scene.getObjectByName('photo-answer-panel');
    const button = answer.children.find((child) => child.userData.answerIndex === 0);
    const target = button.getWorldPosition(new THREE.Vector3());
    bridge.camera.getWorldPosition(ray.position);
    ray.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      target.sub(ray.position).normalize(),
    );
    bridge.photoRevealGame.handleTriggerDown();
  });
  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'selection-feedback');
  await page.waitForTimeout(110);
  await capture('08-正确选择反馈.png');

  await page.waitForFunction(() => document.querySelector('#stage').dataset.photoGamePhase === 'level-complete', { timeout: 3000 });
  await page.waitForTimeout(160);
  await capture('09-单关完成.png');

  await loadFreshGame();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('photo-level-complete', {
      detail: { levelIndex: 3, levelNumber: 4, isFinal: true },
    }));
  });
  await page.waitForTimeout(160);
  await capture('10-最终完成.png');

  console.log(JSON.stringify(fs.readdirSync(outputDir).filter((file) => file.endsWith('.png'))));
} finally {
  await browser.close();
}
