import { chromium } from 'file:///C:/Users/shang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const out = new URL('../.tmp/portfolio-export/', import.meta.url);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
});

const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) {
    errors.push(message.text());
  }
});

try {
  await page.goto('http://127.0.0.1:8794/index.html?build=clean-space-export');
  await page.waitForFunction(() => window.__caveVR?.renderer && window.__caveVR?.scene);
  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => {
    const bridge = window.__caveVR;
    const hidden = [];
    bridge.renderer.setAnimationLoop(null);
    bridge.photoRevealGame?.setUiBlocked?.(true);

    const hideObject = (object) => {
      if (!object || object.visible === false) return;
      object.visible = false;
      hidden.push(object.name || object.type);
    };

    [
      'retro-spatial-game-ui',
      'photo-reveal-vr-ui',
      'photo-answer-panel',
      'photo-reveal-center-wall',
      'flashlight-world',
      'flashlight-cone-group',
      'low-poly-flashlight',
    ].forEach(name => hideObject(bridge.scene.getObjectByName(name)));

    if (bridge.sphere?.world) hideObject(bridge.sphere.world);

    bridge.scene.traverse((object) => {
      if (!object.name) return;
      if (
        object.name.startsWith('wall-marquee-card-') ||
        object.name.includes('center-wall-shadow') ||
        object.name.includes('-word-')
      ) {
        hideObject(object);
        if (object.parent?.type === 'Group') hideObject(object.parent);
      }
    });

    bridge.stage.dataset.uiScreen = 'game';
    document.querySelector('.map-sphere')?.style.setProperty('display', 'none', 'important');
    document.querySelector('#vr-button')?.style.setProperty('display', 'none', 'important');

    bridge.rig.visible = true;
    bridge.rig.traverse((object) => {
      if (
        object.name === 'tunnel-depth-gradient' ||
        object.name === 'tunnel-edges' ||
        object.name === 'floor-grid' ||
        object.name === 'ceiling-grid' ||
        object.name === 'left-wall-grid' ||
        object.name === 'right-wall-grid'
      ) {
        object.visible = true;
      }
    });
    bridge.rig.position.set(0, 0, 0);
    bridge.rig.rotation.set(0, 0, 0);
    bridge.camera.position.set(0, 0.12, 8.15);
    bridge.camera.lookAt(0, -0.04, -8);
    bridge.camera.updateProjectionMatrix();
    bridge.scene.updateMatrixWorld(true);
    bridge.renderer.render(bridge.scene, bridge.camera);

    return {
      hiddenCount: hidden.length,
      hiddenSample: hidden.slice(0, 16),
      canvasSize: [
        bridge.renderer.domElement.width,
        bridge.renderer.domElement.height,
      ],
    };
  });

  // Capture the stage compositor rather than the raw WebGL canvas; Chrome can
  // return a black canvas frame when preserveDrawingBuffer is disabled.
  const canvas = page.locator('#stage');
  const outputPath = fileURLToPath(new URL('clean-threejs-space-3840x2160.png', out));
  await canvas.screenshot({ path: outputPath });
  fs.writeFileSync(new URL('clean-threejs-space-results.json', out), JSON.stringify({ metrics, errors, outputPath }, null, 2));
  console.log(JSON.stringify({ metrics, errors, outputPath }, null, 2));
} finally {
  await browser.close();
}
