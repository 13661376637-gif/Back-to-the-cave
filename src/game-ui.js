(() => {
  const THREE = window.THREE;
  const bridge = window.__caveVR;
  const stage = document.querySelector("#stage");
  const canvas = document.querySelector("#space");
  const vrButton = document.querySelector("#vr-button");
  if (!THREE || !bridge || !stage || !canvas || !bridge.photoRevealGame) return;

  const UI_WIDTH = 768;
  const UI_HEIGHT = 432;
  const UI_TEXTURE_SCALE = 2;
  const PANEL_WIDTH = 3.5;
  const PANEL_HEIGHT = 1.969;
  const PANEL_DISTANCE = 3.25;
  const XR_UI_VERTICAL_OFFSET = bridge.xrComfort?.uiVerticalOffset ?? -0.08;
  const GUIDE_LINE_SCALE = (PANEL_DISTANCE + 0.18) / 1.2;
  const BLUE = "#080892";
  const BLUE_DEEP = "#03036f";
  const WHITE = "#f5f5ef";
  const CYAN = 0x94f6ff;
  const root = new THREE.Group();
  const buttonRoot = new THREE.Group();
  const backgroundCanvas = document.createElement("canvas");
  const backgroundContext = backgroundCanvas.getContext("2d", { alpha: false });
  const backgroundTexture = new THREE.CanvasTexture(backgroundCanvas);
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT),
    new THREE.MeshBasicMaterial({
      map: backgroundTexture,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const underlay = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 3.8),
    new THREE.MeshBasicMaterial({
      color: 0x050577,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const raycaster = new THREE.Raycaster();
  const rayRotation = new THREE.Matrix4();
  const pointerNdc = new THREE.Vector2();
  const viewPosition = new THREE.Vector3();
  const viewQuaternion = new THREE.Quaternion();
  const viewEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const buttons = [];

  backgroundCanvas.width = UI_WIDTH * UI_TEXTURE_SCALE;
  backgroundCanvas.height = UI_HEIGHT * UI_TEXTURE_SCALE;
  backgroundTexture.colorSpace = THREE.SRGBColorSpace;
  backgroundTexture.minFilter = THREE.LinearFilter;
  backgroundTexture.magFilter = THREE.NearestFilter;
  background.renderOrder = 500;
  underlay.position.z = -0.012;
  underlay.renderOrder = 499;
  background.name = "retro-ui-background";
  root.name = "retro-spatial-game-ui";
  root.add(underlay, background, buttonRoot);
  bridge.scene.add(root);

  let visible = true;
  let screen = "start";
  let completion = { levelIndex: 0, levelNumber: 1, isFinal: false };
  let rightController = null;
  let guideLine = null;
  let desktopPointerActive = false;
  let hoveredButton = null;
  let pressedButton = null;
  let actionAt = 0;
  let lastTriggerAt = -Infinity;
  let poseLocked = false;
  let wasXrPresenting = false;

  const gameUI = {
    bindController(controller) {
      rightController = controller || null;
      guideLine = rightController?.getObjectByName?.("controller-guide-line") || null;
      if (guideLine && visible) setGuideLineForUI();
    },
    handleTriggerDown() {
      if (!visible) return false;
      const now = performance.now();
      if (now - lastTriggerAt < 180) return true;
      lastTriggerAt = now;
      activateHoveredButton(now);
      return true;
    },
    handleTriggerUp() {
      return visible;
    },
    isVisible() {
      return visible;
    },
    showStart() {
      showScreen("start");
    },
    showLevels() {
      showScreen("levels");
    },
  };
  bridge.gameUI = gameUI;
  loadUiFonts();

  stage.addEventListener("pointermove", (event) => {
    if (!visible || event.target === vrButton) return;
    updateDesktopPointer(event);
  }, true);

  stage.addEventListener("pointerdown", (event) => {
    if (!visible || event.target === vrButton) return;
    updateDesktopPointer(event);
    event.preventDefault();
    event.stopPropagation();
    gameUI.handleTriggerDown();
  }, true);

  window.addEventListener("photo-level-complete", (event) => {
    completion = event.detail || completion;
    showScreen("complete");
  });

  showScreen("start");
  bridge.registerFrameCallback?.(() => update(performance.now()));

  function updateDesktopPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    desktopPointerActive = true;
  }

  function showScreen(nextScreen) {
    screen = nextScreen;
    visible = true;
    root.visible = true;
    stage.dataset.uiScreen = screen;
    bridge.rig.visible = false;
    bridge.photoRevealGame.setUiBlocked(true);
    bridge.sphere?.setLightEnabled?.(false);
    clearButtons();
    drawScreen();
    buildScreenButtons();
    if (!poseLocked || wasXrPresenting !== bridge.renderer.xr.isPresenting) lockPose();
  }

  function hideUI() {
    visible = false;
    root.visible = false;
    stage.dataset.uiScreen = "game";
    bridge.rig.visible = true;
    restoreGuideLine();
    setFlashlightVisible(true);
  }

  function setFlashlightVisible(show) {
    if (bridge.sphere?.world) bridge.sphere.world.visible = show;
    if (bridge.sphere?.sphere) bridge.sphere.sphere.visible = show;
    if (!show) bridge.sphere?.setLightEnabled?.(false);
  }

  function drawScreen() {
    const ctx = backgroundContext;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
    ctx.setTransform(UI_TEXTURE_SCALE, 0, 0, UI_TEXTURE_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawBlueField(ctx);
    if (screen === "start") drawStart(ctx);
    if (screen === "levels") drawLevels(ctx);
    if (screen === "complete") drawComplete(ctx);
    backgroundTexture.needsUpdate = true;
  }

  function drawBlueField(ctx) {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, UI_WIDTH, UI_HEIGHT);
    const glow = ctx.createRadialGradient(384, 210, 40, 384, 210, 420);
    glow.addColorStop(0, "rgba(25, 36, 230, 0.46)");
    glow.addColorStop(1, "rgba(0, 0, 48, 0.16)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, UI_WIDTH, UI_HEIGHT);
    drawTunnel(ctx);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let y = 0; y < UI_HEIGHT; y += 3) ctx.fillRect(0, y, UI_WIDTH, 1);
  }

  function drawTunnel(ctx) {
    const outer = { x: 124, y: 22, w: 520, h: 374 };
    const inner = { x: 288, y: 134, w: 192, h: 168 };
    ctx.save();
    ctx.strokeStyle = "rgba(245,245,239,0.58)";
    ctx.lineWidth = 1;
    for (let step = 0; step <= 9; step += 1) {
      const t = step / 9;
      const eased = 1 - Math.pow(1 - t, 1.65);
      const x = outer.x + (inner.x - outer.x) * eased;
      const y = outer.y + (inner.y - outer.y) * eased;
      const w = outer.w + (inner.w - outer.w) * eased;
      const h = outer.h + (inner.h - outer.h) * eased;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    }
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach((t) => {
      const topX = outer.x + outer.w * t;
      const innerTopX = inner.x + inner.w * t;
      ctx.beginPath();
      ctx.moveTo(topX, outer.y);
      ctx.lineTo(innerTopX, inner.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(topX, outer.y + outer.h);
      ctx.lineTo(innerTopX, inner.y + inner.h);
      ctx.stroke();
    });
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const outerY = outer.y + outer.h * t;
      const innerY = inner.y + inner.h * t;
      ctx.beginPath();
      ctx.moveTo(outer.x, outerY);
      ctx.lineTo(inner.x, innerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(outer.x + outer.w, outerY);
      ctx.lineTo(inner.x + inner.w, innerY);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawStart(ctx) {
    drawCenteredText(ctx, "BACK", 384, 102, 88, true);
    drawCenteredText(ctx, "TO THE", 384, 150, 42, true);
    drawCenteredText(ctx, "CAVE", 384, 232, 92, true);
    drawSmallLines(ctx, ["(1)", "YOU KNOW", "THE CAVE.", "THIS TIME,", "YOU BUILD", "THE SHADOWS._"], 24, 38, 15, 20);
    drawSmallLines(ctx, ["SELECT.", "HIDE.", "REFRAME.", "SEE WHAT", "REMAINS._"], 24, 278, 15, 20);
    drawSmallLines(ctx, ["A RETRO MEDIA PUZZLE", "ABOUT WHAT WE CHOOSE", "TO SEE", "----------------", "V1.0.0"], 618, 74, 13, 18, "center");
    drawSmallLines(ctx, ["(2)", "EVERY FRAGMENT", "CAN BE TRUE.", "WHAT CHANGES", "IS WHAT REMAINS", "VISIBLE._"], 650, 184, 13, 18);
    drawSmallLines(ctx, ["(3)", "NOTHING HERE", "HAS TO BE FALSE", "TO BECOME", "MISLEADING._"], 650, 310, 13, 18);
    drawMountain(ctx, 74, 252);
    drawMiniTunnel(ctx, 704, 48);
    drawChecker(ctx, 414);
  }

  function drawLevels(ctx) {
    drawCenteredText(ctx, "BACK", 384, 74, 62, true);
    drawCenteredText(ctx, "TO THE", 384, 105, 29, true);
    drawCenteredText(ctx, "CAVE", 384, 148, 60, true);
    drawDashedLine(ctx, 300, 166, 468, 166);
    drawCenteredText(ctx, "SELECT LEVEL", 384, 196, 24, false);
    drawSmallLines(ctx, ["POINT", "SELECT", "ENTER"], 52, 178, 14, 20);
    drawSmallLines(ctx, ["4 LEVELS", "SMALLER LIGHT", "EACH ROUND._"], 652, 178, 13, 20);
  }

  function drawComplete(ctx) {
    drawDashedLine(ctx, 42, 82, 726, 82);
    drawDashedLine(ctx, 42, 350, 726, 350);
    drawCenteredText(ctx, completion.isFinal ? "CAVE CLEARED" : "MATCH FOUND", 384, 154, 38, false);
    drawCenteredText(
      ctx,
      completion.isFinal ? "ALL LEVELS COMPLETE" : `LEVEL ${String(completion.levelNumber).padStart(2, "0")} COMPLETE`,
      384,
      238,
      completion.isFinal ? 50 : 66,
      true,
    );
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(74, 274);
    ctx.lineTo(694, 274);
    ctx.stroke();
  }

  function buildScreenButtons() {
    if (screen === "start") {
      addButton("PLAY", { x: 384, y: 310, w: 190, h: 42 }, { type: "play" });
      addButton("LEVEL SELECT", { x: 384, y: 362, w: 220, h: 38 }, { type: "levels" });
      return;
    }
    if (screen === "levels") {
      const positions = [
        { x: 326, y: 250 }, { x: 442, y: 250 },
        { x: 326, y: 320 }, { x: 442, y: 320 },
      ];
      positions.forEach((position, index) => {
        addButton(String(index + 1).padStart(2, "0"), { ...position, w: 98, h: 54 }, { type: "level", index });
      });
      addButton("BACK", { x: 384, y: 388, w: 126, h: 34 }, { type: "start" });
      return;
    }
    if (screen === "complete") {
      if (completion.isFinal) {
        addButton("LEVEL SELECT", { x: 384, y: 318, w: 190, h: 38 }, { type: "levels" });
        return;
      }
      addButton("CONTINUE", { x: 334, y: 318, w: 154, h: 38 }, { type: "continue" });
      addButton("LEVELS", { x: 500, y: 318, w: 130, h: 38 }, { type: "levels" });
    }
  }

  function addButton(label, rect, action) {
    const buttonCanvas = document.createElement("canvas");
    const buttonContext = buttonCanvas.getContext("2d");
    buttonCanvas.width = 512;
    buttonCanvas.height = 160;
    const texture = new THREE.CanvasTexture(buttonCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    const width = (rect.w / UI_WIDTH) * PANEL_WIDTH;
    const height = (rect.h / UI_HEIGHT) * PANEL_HEIGHT;
    const position = screenToLocal(rect.x, rect.y);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    mesh.position.set(position.x, position.y, 0.018);
    mesh.renderOrder = 502;
    mesh.userData.action = action;
    mesh.userData.label = label;
    mesh.userData.buttonCanvas = buttonCanvas;
    mesh.userData.buttonContext = buttonContext;
    mesh.userData.texture = texture;
    buttonRoot.add(mesh);
    buttons.push(mesh);
    drawButton(mesh, false, false);
  }

  function drawButton(button, hovered, pressed) {
    const ctx = button.userData.buttonContext;
    const label = button.userData.label;
    const w = 512;
    const h = 160;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pressed ? "rgba(255,255,255,0.32)" : hovered ? "rgba(48,86,255,0.62)" : "rgba(1,2,100,0.72)";
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = hovered || pressed ? 10 : 6;
    ctx.shadowColor = hovered || pressed ? "rgba(130,245,255,0.9)" : "transparent";
    ctx.shadowBlur = hovered || pressed ? 24 : 0;
    notchedRect(ctx, 12, 12, w - 24, h - 24, 24);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const fontSize = label.length > 10 ? 47 : label.length > 7 ? 56 : 70;
    ctx.fillStyle = WHITE;
    ctx.font = `${fontSize}px "CavePixel", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, w / 2, h / 2 + 2);
    button.userData.texture.needsUpdate = true;
  }

  function notchedRect(ctx, x, y, width, height, notch) {
    ctx.beginPath();
    ctx.moveTo(x + notch, y);
    ctx.lineTo(x + width - notch, y);
    ctx.lineTo(x + width, y + notch);
    ctx.lineTo(x + width, y + height - notch);
    ctx.lineTo(x + width - notch, y + height);
    ctx.lineTo(x + notch, y + height);
    ctx.lineTo(x, y + height - notch);
    ctx.lineTo(x, y + notch);
    ctx.closePath();
  }

  function clearButtons() {
    hoveredButton = null;
    pressedButton = null;
    buttons.splice(0).forEach((button) => {
      buttonRoot.remove(button);
      button.geometry.dispose();
      button.material.dispose();
      button.userData.texture.dispose();
    });
  }

  function lockPose() {
    const viewCamera = bridge.renderer.xr.isPresenting
      ? bridge.renderer.xr.getCamera(bridge.camera)
      : bridge.camera;
    viewCamera.getWorldPosition(viewPosition);
    const verticalOffset = bridge.renderer.xr.isPresenting ? XR_UI_VERTICAL_OFFSET : 0;
    root.position.set(0, viewPosition.y + verticalOffset, viewPosition.z - PANEL_DISTANCE);
    root.quaternion.identity();
    poseLocked = true;
    wasXrPresenting = bridge.renderer.xr.isPresenting;
  }

  function stabilizeRoll() {
    if (!bridge.renderer.xr.isPresenting) {
      root.rotation.z = 0;
      return;
    }
    const viewCamera = bridge.renderer.xr.getCamera(bridge.camera);
    viewCamera.getWorldQuaternion(viewQuaternion);
    viewEuler.setFromQuaternion(viewQuaternion, "YXZ");
    root.rotation.z = THREE.MathUtils.clamp(
      viewEuler.z,
      -THREE.MathUtils.degToRad(30),
      THREE.MathUtils.degToRad(30),
    );
  }

  function setActiveRay() {
    if (rightController) {
      rightController.updateMatrixWorld(true);
      rayRotation.identity().extractRotation(rightController.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(rightController.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rayRotation).normalize();
      return true;
    }
    if (!desktopPointerActive) return false;
    raycaster.setFromCamera(pointerNdc, bridge.camera);
    return true;
  }

  function getButtonHit() {
    if (!setActiveRay()) return null;
    bridge.scene.updateMatrixWorld(true);
    return raycaster.intersectObjects(buttons, false)[0] || null;
  }

  function updateHover() {
    const hit = getButtonHit();
    const nextHovered = hit?.object || null;
    if (nextHovered !== hoveredButton) {
      if (hoveredButton && hoveredButton !== pressedButton) drawButton(hoveredButton, false, false);
      hoveredButton = nextHovered;
      if (hoveredButton && hoveredButton !== pressedButton) drawButton(hoveredButton, true, false);
    }
    if (!guideLine) return;
    setGuideLineForUI();
  }

  function activateHoveredButton(now) {
    const hit = getButtonHit();
    if (!hit) return;
    pressedButton = hit.object;
    actionAt = now + 190;
    drawButton(pressedButton, true, true);
    pressedButton.scale.set(1.06, 1.06, 1);
  }

  function resolvePressedButton() {
    if (!pressedButton) return;
    const action = pressedButton.userData.action;
    pressedButton.scale.set(1, 1, 1);
    pressedButton = null;
    runAction(action);
  }

  function runAction(action) {
    if (!action) return;
    if (action.type === "start") {
      showScreen("start");
      return;
    }
    if (action.type === "levels") {
      showScreen("levels");
      return;
    }
    if (action.type === "play") {
      hideUI();
      bridge.photoRevealGame.startLevel(0);
      return;
    }
    if (action.type === "level") {
      hideUI();
      bridge.photoRevealGame.startLevel(action.index);
      return;
    }
    if (action.type === "continue") {
      hideUI();
      bridge.photoRevealGame.advanceFromCompletion();
    }
  }

  function update(now) {
    if (!visible) return;
    if (!poseLocked || wasXrPresenting !== bridge.renderer.xr.isPresenting) lockPose();
    stabilizeRoll();
    setFlashlightVisible(false);
    if (pressedButton) {
      const pulse = 1.04 + Math.sin(now * 0.045) * 0.025;
      pressedButton.scale.set(pulse, pulse, 1);
      if (now >= actionAt) resolvePressedButton();
      return;
    }
    updateHover();
  }

  function setGuideLineForUI() {
    if (!guideLine) return;
    guideLine.visible = true;
    guideLine.scale.z = GUIDE_LINE_SCALE;
    guideLine.material.color.setHex(CYAN);
    guideLine.material.opacity = 0.82;
  }

  function restoreGuideLine() {
    if (!guideLine) return;
    guideLine.visible = true;
    guideLine.scale.z = guideLine.userData.defaultScaleZ || 4.5;
    guideLine.material.color.setHex(0x77ecff);
    guideLine.material.opacity = 0.72;
  }

  function screenToLocal(x, y) {
    return {
      x: (x / UI_WIDTH - 0.5) * PANEL_WIDTH,
      y: (0.5 - y / UI_HEIGHT) * PANEL_HEIGHT,
    };
  }

  function drawCenteredText(ctx, text, x, y, size, bold) {
    ctx.fillStyle = WHITE;
    ctx.font = `${bold ? size * 1.04 : size}px "CavePixel", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  function drawSmallLines(ctx, lines, x, y, size, gap, align = "left") {
    ctx.fillStyle = WHITE;
    ctx.font = `${size * 1.22}px "CaveTerminal", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * gap));
  }

  function drawDashedLine(ctx, x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawChecker(ctx, y) {
    ctx.fillStyle = WHITE;
    const size = 7;
    for (let x = 8; x < UI_WIDTH - 8; x += size) {
      const index = Math.floor((x - 8) / size);
      ctx.fillRect(x, y + (index % 2 ? 0 : size), size, size);
    }
  }

  function drawMountain(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 38, y);
    ctx.lineTo(x - 12, y - 34);
    ctx.lineTo(x + 4, y - 12);
    ctx.lineTo(x + 22, y - 42);
    ctx.lineTo(x + 48, y);
    ctx.stroke();
    ctx.strokeRect(x - 8, y - 16, 18, 16);
    ctx.restore();
  }

  function drawMiniTunnel(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const inset = i * 5;
      ctx.strokeRect(x - 24 + inset, y - 18 + inset * 0.7, 48 - inset * 2, 36 - inset * 1.4);
    }
    ctx.restore();
  }

  function loadUiFonts() {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    Promise.all([
      new FontFace("CavePixel", "url('./assets/fonts/jersey-10.ttf')").load(),
      new FontFace("CaveTerminal", "url('./assets/fonts/vt323.ttf')").load(),
    ]).then((fonts) => {
      fonts.forEach((font) => document.fonts.add(font));
      drawScreen();
      buttons.forEach((button) => drawButton(button, button === hoveredButton, button === pressedButton));
    }).catch((error) => {
      console.warn("Pixel UI fonts could not be loaded.", error);
    });
  }
})();
