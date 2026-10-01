(() => {
  const THREE = window.THREE;
  const bridge = window.__caveVR;
  const stage = document.querySelector("#stage");
  const canvas = document.querySelector("#space");
  if (!THREE || !bridge || !stage || !canvas) return;

  // Temporary puzzle set. Replace these paths and labels when final content is approved.
  const levels = [
    { texturePath: "./assets/levels/level-01-lost-wallet.png", question: "WHAT IS HE DOING?", flashRadius: 0.34, correctAnswerIndex: 0, options: ["RETURNING IT", "STEALING IT", "SECRET PAYMENT", "CHECKING THE ID", "HIDING THE WALLET", "ASKING FOR HELP"] },
    { texturePath: "./assets/levels/level-02-store-dispute.png", question: "WHO BROKE THE BOTTLE?", flashRadius: 0.24, correctAnswerIndex: 1, options: ["CUSTOMER DID IT", "PERSON LEAVING", "FALSE ACCUSATION", "STORE CLERK", "PERSON ENTERING", "NO ONE"] },
    { texturePath: "./assets/levels/level-03-parking-load.png", question: "WHAT IS HAPPENING HERE?", flashRadius: 0.16, correctAnswerIndex: 0, options: ["MOVING HOUSE", "STEALING ART", "HIDING EVIDENCE", "MOVIE SHOOT", "GARAGE SALE", "POLICE SEARCH"] },
    { texturePath: "./assets/levels/level-04-cropped-incident.png", question: "WHAT IS HE DOING TO THE OFFICER?", flashRadius: 0.09, correctAnswerIndex: 0, options: ["HELPING OFFICER", "ATTACKING OFFICER", "STAGED NEWS", "TAKING HIS BADGE", "HANDING OVER KEYS", "BLOCKING HIS WAY"] },
  ];

  const roomSize = bridge.roomSize || { width: 12.8, height: 9.65 };
  const XR_UI_VERTICAL_OFFSET = bridge.xrComfort?.uiVerticalOffset ?? -0.08;
  const blackPixel = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  blackPixel.needsUpdate = true;

  const uniforms = {
    flashUv: { value: new THREE.Vector2(0.5, 0.5) },
    flashRadius: { value: levels[0].flashRadius },
    isFlashActive: { value: false },
    photoTexture: { value: blackPixel },
    wallAspect: { value: roomSize.width / roomSize.height },
  };

  const wallMaterial = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    depthWrite: true,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec2 flashUv;
      uniform float flashRadius;
      uniform bool isFlashActive;
      uniform sampler2D photoTexture;
      uniform float wallAspect;
      varying vec2 vUv;

      void main() {
        if (!isFlashActive) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        vec2 delta = vUv - flashUv;
        delta.x *= wallAspect;
        float radiusDistance = length(delta);
        float feather = max(0.008, flashRadius * 0.18);
        float reveal = 1.0 - smoothstep(flashRadius - feather, flashRadius, radiusDistance);
        vec3 photo = texture2D(photoTexture, vUv).rgb;
        vec3 litPhoto = min(photo * 1.65 + vec3(0.055), vec3(1.0));
        gl_FragColor = vec4(litPhoto * reveal, 1.0);
      }
    `,
  });

  const wallMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(roomSize.width, roomSize.height, 1, 1),
    wallMaterial,
  );
  wallMesh.name = "photo-reveal-center-wall";
  wallMesh.position.set(0, 0, (bridge.centerWallZ || -8) - 0.025);
  wallMesh.renderOrder = 1;
  bridge.rig.add(wallMesh);

  const raycaster = new THREE.Raycaster();
  const rayRotation = new THREE.Matrix4();
  const pointerNdc = new THREE.Vector2(0, 0);
  const viewQuaternion = new THREE.Quaternion();
  const viewEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const hoverScale = new THREE.Vector3(1, 1, 1);
  const whiteColor = new THREE.Color(0xffffff);
  const correctFlashColor = new THREE.Color(0x38ff8b);
  const wrongFlashColor = new THREE.Color(0xff2854);
  const eliminatedTint = new THREE.Color(0x273249);
  const guideDefaultColor = new THREE.Color(0x77ecff);
  const textureLoader = new THREE.TextureLoader();
  const hudRoot = new THREE.Group();
  const countdownPanel = new THREE.Group();
  const answerPanel = new THREE.Group();
  const completePanel = new THREE.Group();
  const answerButtons = [];
  const answerLabels = [];
  const eliminatedAnswers = levels.map(() => new Set());
  let countdownDigit = null;
  const levelMarkers = [];
  let answerPanelSurface = null;
  let questionLabel = null;
  let selectionGlow = null;
  let countdownBackground = null;

  hudRoot.name = "photo-reveal-vr-ui";
  answerPanel.name = "photo-answer-panel";
  hudRoot.add(countdownPanel, completePanel);
  bridge.scene.add(hudRoot, answerPanel);

  countdownPanel.position.set(0.72, 0.42, -1.45);
  answerPanel.scale.setScalar(1.9);
  completePanel.position.set(0, 0, -1.7);
  countdownPanel.visible = true;
  answerPanel.visible = false;
  completePanel.visible = false;

  let rightController = null;
  let phase = "loading";
  let currentLevelIndex = 0;
  let currentTexture = null;
  let flashEndAt = 0;
  let lastTimerSecond = -1;
  let loadToken = 0;
  let lastTriggerAt = -Infinity;
  let desktopRayActive = false;
  let guideLine = null;
  let hoveredAnswerIndex = -1;
  let selectedAnswerIndex = -1;
  let selectionIsCorrect = false;
  let selectionResolveAt = 0;
  let uiBlocked = true;
  let answerPoseIsXR = null;

  buildCountdownPanel();
  buildAnswerPanel();
  buildCompletePanel();
  loadAnswerFont();
  loadLevel(0);
  bridge.renderer.xr.addEventListener?.("sessionstart", () => {
    // Reapply the bright Quest-safe answer colors when the XR render path starts.
    applyAnswerButtonStates();
  });
  bridge.registerFrameCallback?.(() => update(performance.now()));

  const game = {
    levels,
    wallMesh,
    uniforms,
    bindController(controller) {
      rightController = controller || null;
      guideLine = rightController?.getObjectByName?.("controller-guide-line") || null;
      resetGuideLine();
    },
    handleTriggerDown() {
      if (uiBlocked) return false;
      const now = performance.now();
      if (now - lastTriggerAt < 160) return true;
      lastTriggerAt = now;

      if (phase === "question") {
        chooseAnswer();
        return true;
      }
      if (phase === "flashing") {
        if (updateFlashUv()) uniforms.isFlashActive.value = true;
        return true;
      }
      if (phase === "ready") startFlash(now);
      return true;
    },
    handleTriggerUp() {
      uniforms.isFlashActive.value = false;
      bridge.sphere?.setLightEnabled?.(false);
      bridge.sphere?.clearRevealTarget?.();
      return phase === "flashing";
    },
    isFlashActive() {
      return phase === "flashing";
    },
    setUiBlocked(blocked) {
      uiBlocked = Boolean(blocked);
      if (uiBlocked) {
        countdownDigit.visible = false;
        uniforms.isFlashActive.value = false;
        answerPanel.visible = false;
        countdownPanel.visible = false;
        bridge.sphere?.setLightEnabled?.(false);
        bridge.sphere?.clearRevealTarget?.();
      }
    },
    startLevel(index = 0) {
      uiBlocked = false;
      currentLevelIndex = THREE.MathUtils.clamp(Math.round(index), 0, levels.length - 1);
      eliminatedAnswers[currentLevelIndex].clear();
      updateAnswerLabels();
      answerPanel.visible = false;
      completePanel.visible = false;
      countdownPanel.visible = true;
      applyAnswerButtonStates();
      loadLevel(currentLevelIndex);
    },
    advanceFromCompletion() {
      if (phase !== "level-complete") return false;
      if (currentLevelIndex >= levels.length - 1) return false;
      currentLevelIndex += 1;
      eliminatedAnswers[currentLevelIndex].clear();
      updateAnswerLabels();
      uiBlocked = false;
      countdownPanel.visible = true;
      applyAnswerButtonStates();
      loadLevel(currentLevelIndex);
      return true;
    },
    getCurrentLevelIndex() {
      return currentLevelIndex;
    },
    isUiBlocked() {
      return uiBlocked;
    },
  };
  bridge.photoRevealGame = game;

  stage.addEventListener("pointerdown", (event) => {
    if (bridge.xrSessionActive || bridge.renderer.xr.isPresenting) return;
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    desktopRayActive = true;
    game.handleTriggerDown();
  }, true);

  function makePlane(width, height, color, opacity = 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    mesh.renderOrder = 100;
    return mesh;
  }

  function buildCountdownPanel() {
    countdownBackground = makePlane(0.66, 0.126, 0x030711, 0.92);
    countdownBackground.position.y = -0.072;
    countdownPanel.add(countdownBackground);
    // A separate, unframed digit keeps the observation area clear in both eyes.
    const digitCanvas = document.createElement("canvas");
    digitCanvas.width = digitCanvas.height = 256;
    const digitTexture = new THREE.CanvasTexture(digitCanvas);
    digitTexture.colorSpace = THREE.SRGBColorSpace;
    digitTexture.minFilter = THREE.LinearFilter;
    digitTexture.magFilter = THREE.NearestFilter;
    digitTexture.generateMipmaps = false;
    countdownDigit = makePlane(0.34, 0.34, 0xffffff, 0.999);
    countdownDigit.name = "photo-countdown-digit";
    countdownDigit.material.map = digitTexture;
    countdownDigit.material.opacity = 1;
    countdownDigit.userData.canvas = digitCanvas;
    countdownDigit.visible = false;
    hudRoot.add(countdownDigit);
    for (let index = 0; index < levels.length; index += 1) {
      const marker = makePlane(0.075, 0.025, 0x5a6473, 0.9);
      marker.position.set(-0.135 + index * 0.09, -0.075, 0.02);
      countdownPanel.add(marker);
      levelMarkers.push(marker);
    }
  }

  function buildAnswerPanel() {
    answerPanelSurface = makePlane(1.9, 0.78, 0x02050c, 0.2);
    answerPanel.add(answerPanelSurface);
    questionLabel = makeQuestionLabel();
    questionLabel.name = "photo-question-label";
    questionLabel.position.set(0, 0.33, 0.018);
    answerPanel.add(questionLabel);
    selectionGlow = makePlane(0.84, 0.18, 0xffffff, 0);
    selectionGlow.material.blending = THREE.AdditiveBlending;
    selectionGlow.renderOrder = 99;
    selectionGlow.visible = false;
    answerPanel.add(selectionGlow);
    // Green and red are reserved for correct and wrong feedback.
    [0xff8a24, 0xffd43b, 0x2488ff, 0x925cf2, 0x16b8c8, 0xe05da9].forEach((color, index) => {
      const button = makePlane(0.78, 0.14, color, 0.92);
      const column = index % 2;
      const row = Math.floor(index / 2);
      button.position.set(column === 0 ? -0.42 : 0.42, 0.17 - row * 0.2, 0.025);
      button.userData.answerIndex = index;
      button.userData.baseColor = new THREE.Color(color);
      const label = makeAnswerLabel();
      label.name = `photo-answer-label-${index + 1}`;
      label.position.z = 0.018;
      button.add(label);
      answerPanel.add(button);
      answerButtons.push(button);
      answerLabels.push(label);
    });
    updateAnswerLabels();
  }

  function makeQuestionLabel() {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 1024;
    labelCanvas.height = 128;
    const labelContext = labelCanvas.getContext("2d");
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.14),
      new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    label.renderOrder = 104;
    label.userData.labelCanvas = labelCanvas;
    label.userData.labelContext = labelContext;
    label.userData.labelTexture = texture;
    return label;
  }

  function makeAnswerLabel() {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 1024;
    labelCanvas.height = 192;
    const labelContext = labelCanvas.getContext("2d");
    const texture = new THREE.CanvasTexture(labelCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.18),
      new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    label.renderOrder = 104;
    label.userData.labelCanvas = labelCanvas;
    label.userData.labelContext = labelContext;
    label.userData.labelTexture = texture;
    return label;
  }

  function drawAnswerLabel(label, text) {
    const ctx = label.userData.labelContext;
    const canvas = label.userData.labelCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = 70;
    do {
      ctx.font = `${fontSize}px "CaveAnswerPixel", monospace`;
      fontSize -= 2;
    } while (fontSize > 34 && ctx.measureText(text).width > 900);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
    label.userData.labelTexture.needsUpdate = true;
  }

  function updateAnswerLabels() {
    const options = levels[currentLevelIndex]?.options || [];
    answerLabels.forEach((label, index) => drawAnswerLabel(label, options[index] || ""));
    if (questionLabel) drawQuestionLabel(questionLabel, levels[currentLevelIndex]?.question || "");
  }

  function drawQuestionLabel(label, text) {
    const ctx = label.userData.labelContext;
    const canvas = label.userData.labelCanvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let fontSize = 62;
    do {
      ctx.font = `${fontSize}px "CaveAnswerPixel", monospace`;
      fontSize -= 2;
    } while (fontSize > 36 && ctx.measureText(text).width > 960);
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    label.userData.labelTexture.needsUpdate = true;
  }

  function loadAnswerFont() {
    if (typeof FontFace !== "function") return;
    new FontFace("CaveAnswerPixel", "url('./assets/fonts/jersey-10.ttf')").load()
      .then((font) => {
        document.fonts.add(font);
        updateAnswerLabels();
        drawCountdownDigit(lastTimerSecond);
      })
      .catch(() => {});
  }

  function buildCompletePanel() {
    completePanel.add(makePlane(1.36, 0.52, 0x061018, 0.96));
    const outer = makePlane(1.08, 0.22, 0x38efff, 0.96);
    outer.position.z = 0.02;
    const inner = makePlane(0.86, 0.08, 0x061018, 1);
    inner.position.z = 0.025;
    completePanel.add(outer, inner);
  }

  function setRayFromController() {
    if (!rightController) return false;
    rightController.updateMatrixWorld(true);
    rayRotation.identity().extractRotation(rightController.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(rightController.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rayRotation).normalize();
    return true;
  }

  function setActiveRay() {
    if (setRayFromController()) return true;
    if (!desktopRayActive) return false;
    raycaster.setFromCamera(pointerNdc, bridge.camera);
    return true;
  }

  function updateFlashUv() {
    if (!setActiveRay()) return false;
    bridge.scene.updateMatrixWorld(true);
    const hit = raycaster.intersectObject(wallMesh, false)[0];
    if (!hit?.uv) return false;
    uniforms.flashUv.value.copy(hit.uv);
    bridge.sphere?.setRevealTarget?.(hit.point);
    return true;
  }

  function startFlash(now) {
    if (!updateFlashUv()) return;
    phase = "flashing";
    stage.dataset.photoGamePhase = phase;
    flashEndAt = now + 3000;
    lastTimerSecond = -1;
    uniforms.isFlashActive.value = true;
    countdownPanel.visible = true;
    bridge.sphere?.setLightEnabled?.(true);
    updateTimer(3);
  }

  function finishFlash() {
    phase = "question";
    stage.dataset.photoGamePhase = phase;
    uniforms.isFlashActive.value = false;
    countdownPanel.visible = true;
    updateTimer(0);
    lockAnswerPanelPose();
    applyAnswerButtonStates();
    answerPanel.visible = true;
    bridge.sphere?.setLightEnabled?.(false);
    bridge.sphere?.clearRevealTarget?.();
  }

  function chooseAnswer() {
    const hit = getAnswerHit();
    stage.dataset.answerRay = `${pointerNdc.x.toFixed(3)},${pointerNdc.y.toFixed(3)}`;
    stage.dataset.answerHit = hit ? String(hit.object.userData.answerIndex) : "none";
    if (!hit) return;

    beginSelectionFeedback(hit.object.userData.answerIndex, performance.now());
  }

  function getAnswerHit() {
    if (!setActiveRay()) return null;
    bridge.scene.updateMatrixWorld(true);
    return raycaster.intersectObjects(answerButtons, false)
      .find((hit) => !isAnswerEliminated(hit.object.userData.answerIndex)) || null;
  }

  function beginSelectionFeedback(answerIndex, now) {
    selectedAnswerIndex = answerIndex;
    selectionIsCorrect = answerIndex === levels[currentLevelIndex].correctAnswerIndex;
    selectionResolveAt = now + (selectionIsCorrect ? 980 : 1380);
    phase = "selection-feedback";
    stage.dataset.photoGamePhase = phase;
    stage.dataset.selectedAnswer = String(answerIndex);
    const selectedButton = answerButtons[answerIndex];
    selectionGlow.position.copy(selectedButton.position);
    selectionGlow.position.z = 0.012;
    selectionGlow.material.color.setHex(selectionIsCorrect ? 0x5cff9b : 0xff3858);
    selectionGlow.material.opacity = 0.72;
    selectionGlow.visible = true;
    selectedButton.material.color.copy(selectionIsCorrect ? correctFlashColor : wrongFlashColor);
    answerLabels[answerIndex].material.color.setHex(0xffffff);
    answerLabels[answerIndex].material.opacity = 1;
  }

  function finishSelectionFeedback() {
    hoveredAnswerIndex = -1;
    if (!selectionIsCorrect) eliminatedAnswers[currentLevelIndex].add(selectedAnswerIndex);
    answerButtons.forEach((button) => {
      button.scale.set(1, 1, 1);
    });
    applyAnswerButtonStates();
    selectionGlow.visible = false;
    selectionGlow.scale.set(1, 1, 1);
    resetGuideLine();

    answerPanel.visible = false;
    if (!selectionIsCorrect) {
      phase = "ready";
      stage.dataset.photoGamePhase = phase;
      return;
    }

    phase = "level-complete";
    stage.dataset.photoGamePhase = phase;
    uniforms.isFlashActive.value = false;
    countdownPanel.visible = false;
    updateLevelMarkers();
    window.dispatchEvent(new CustomEvent("photo-level-complete", {
      detail: {
        levelIndex: currentLevelIndex,
        levelNumber: currentLevelIndex + 1,
        isFinal: currentLevelIndex === levels.length - 1,
      },
    }));
  }

  function loadLevel(index) {
    phase = "loading";
    updateAnswerLabels();
    stage.dataset.photoGamePhase = phase;
    stage.dataset.photoLevel = String(index + 1);
    uniforms.isFlashActive.value = false;
    uniforms.flashRadius.value = levels[index].flashRadius;
    bridge.sphere?.setRevealRadius?.(levels[index].flashRadius);
    bridge.sphere?.clearRevealTarget?.();
    updateTimer(0);
    updateLevelMarkers();
    const token = ++loadToken;

    textureLoader.load(levels[index].texturePath, (texture) => {
      if (token !== loadToken) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = Math.min(4, bridge.renderer.capabilities.getMaxAnisotropy());
      currentTexture?.dispose();
      currentTexture = texture;
      uniforms.photoTexture.value = texture;
      phase = "ready";
      stage.dataset.photoGamePhase = phase;
      stage.dataset.scene = "map";
      stage.classList.add("is-map-ready");
      window.dispatchEvent(new CustomEvent("cave-map-ready", { detail: { levelId: `photo-${index + 1}` } }));
    }, undefined, (error) => {
      console.warn(`Photo placeholder failed to load: ${levels[index].texturePath}`, error);
      phase = "ready";
      stage.dataset.photoGamePhase = phase;
    });
  }

  function updateTimer(seconds) {
    if (seconds === lastTimerSecond) return;
    lastTimerSecond = seconds;
    // Visual BEEP state only: no audio file is used.
    countdownDigit.visible = seconds > 0 && !uiBlocked;
    drawCountdownDigit(seconds);
  }

  function drawCountdownDigit(seconds) {
    const digitCanvas = countdownDigit.userData.canvas;
    const ctx = digitCanvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 256);
    if (seconds > 0) {
      ctx.font = '220px "CaveAnswerPixel", monospace';
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(seconds), 128, 138);
    }
    countdownDigit.userData.seconds = Math.max(0, seconds);
    countdownDigit.material.map.needsUpdate = true;
  }

  function updateLevelMarkers() {
    levelMarkers.forEach((marker, index) => {
      const color = index < currentLevelIndex
        ? 0x1b8794
        : index === currentLevelIndex ? 0x38efff : 0x5a6473;
      marker.material.color.setHex(color);
    });
  }

  function updateChoiceHover() {
    if (!setActiveRay()) return;
    bridge.scene.updateMatrixWorld(true);
    const panelHits = raycaster.intersectObjects([answerPanelSurface, ...answerButtons], false);
    const answerHit = panelHits.find((hit) => (
      Number.isInteger(hit.object.userData.answerIndex)
      && !isAnswerEliminated(hit.object.userData.answerIndex)
    ));
    hoveredAnswerIndex = answerHit?.object.userData.answerIndex ?? -1;

    answerButtons.forEach((button, index) => {
      if (isAnswerEliminated(index)) {
        button.material.color.copy(button.userData.baseColor).lerp(eliminatedTint, 0.72);
        button.material.opacity = 0.76;
        answerLabels[index].material.color.setHex(0xffffff);
        answerLabels[index].material.opacity = 0.5;
        hoverScale.set(1, 1, 1);
        button.scale.lerp(hoverScale, 0.3);
        return;
      }
      button.material.opacity = 0.92;
      button.material.color.copy(button.userData.baseColor);
      answerLabels[index].material.color.setHex(index === hoveredAnswerIndex ? 0xa8fbff : 0xffffff);
      answerLabels[index].material.opacity = 1;
      if (index === hoveredAnswerIndex) button.material.color.lerp(whiteColor, 0.38);
      const scale = index === hoveredAnswerIndex ? 1.045 : 1;
      hoverScale.set(scale, scale, 1);
      button.scale.lerp(hoverScale, 0.3);
    });

    if (!guideLine) return;
    const panelHit = panelHits[0];
    guideLine.scale.z = panelHit ? Math.max(1, panelHit.distance / 1.2) : 2.1;
    guideLine.material.opacity = 0.94;
    guideLine.material.color.copy(guideDefaultColor);
  }

  function updateSelectionFeedback(now) {
    const selectedButton = answerButtons[selectedAnswerIndex];
    const remaining = Math.max(0, selectionResolveAt - now);
    const pulse = 0.5 + Math.sin(remaining * 0.045) * 0.5;
    selectedButton.scale.setScalar(1.05 + pulse * 0.08);
    selectedButton.scale.z = 1;
    if (selectionIsCorrect) {
      selectedButton.material.color.copy(correctFlashColor).lerp(whiteColor, 0.12 + pulse * 0.28);
    } else {
      selectedButton.material.color.copy(wrongFlashColor).lerp(whiteColor, 0.08 + pulse * 0.22);
    }
    answerLabels[selectedAnswerIndex].material.color.setHex(0xffffff);
    selectionGlow.material.opacity = (selectionIsCorrect ? 0.28 : 0.22) + pulse * 0.55;
    selectionGlow.scale.setScalar(1 + pulse * 0.12);
    if (guideLine) guideLine.material.color.copy(selectionIsCorrect ? correctFlashColor : wrongFlashColor);
    if (now >= selectionResolveAt) finishSelectionFeedback();
  }

  function resetGuideLine() {
    if (!guideLine) return;
    guideLine.scale.z = guideLine.userData.defaultScaleZ || 4.5;
    guideLine.material.color.setHex(0x77ecff);
    guideLine.material.opacity = 0.64;
  }

  function isAnswerEliminated(answerIndex) {
    return eliminatedAnswers[currentLevelIndex]?.has(answerIndex) || false;
  }

  function applyAnswerButtonStates() {
    answerButtons.forEach((button, index) => {
      const eliminated = isAnswerEliminated(index);
      button.material.color.copy(button.userData.baseColor);
      if (eliminated) button.material.color.lerp(eliminatedTint, 0.72);
      button.material.opacity = eliminated ? 0.76 : 0.92;
      answerLabels[index]?.material.color.setHex(0xffffff);
      if (answerLabels[index]) answerLabels[index].material.opacity = eliminated ? 0.5 : 1;
      button.scale.set(1, 1, 1);
    });
  }

  function updateHudPose() {
    const viewCamera = bridge.renderer.xr.isPresenting
      ? bridge.renderer.xr.getCamera(bridge.camera)
      : bridge.camera;
    viewCamera.getWorldPosition(hudRoot.position);
    viewCamera.getWorldQuaternion(hudRoot.quaternion);
    // Three metres away avoids a close HUD; desktop placement stays within the canvas.
    const elevation = bridge.renderer.xr.isPresenting
      ? Math.tan(THREE.MathUtils.degToRad(18))
      : Math.tan(THREE.MathUtils.degToRad(bridge.camera.fov / 2)) * 0.76;
    countdownDigit.position.set(0, elevation * 3, -3);
  }

  function lockAnswerPanelPose() {
    // The hidden start menu may still have desktop coordinates behind the XR player.
    // Anchor to the current viewer once per popup, keeping the panel level and wall-parallel.
    answerPoseIsXR = bridge.renderer.xr.isPresenting;
    const viewCamera = answerPoseIsXR
      ? bridge.renderer.xr.getCamera(bridge.camera)
      : bridge.camera;
    viewCamera.getWorldPosition(answerPanel.position);
    const verticalOffset = answerPoseIsXR ? XR_UI_VERTICAL_OFFSET : 0;
    answerPanel.position.set(0, answerPanel.position.y + verticalOffset, answerPanel.position.z - 3.25);
    answerPanel.quaternion.identity();
  }

  function stabilizeAnswerPanelRoll() {
    if (!bridge.renderer.xr.isPresenting) {
      answerPanel.rotation.z = 0;
      return;
    }
    const viewCamera = bridge.renderer.xr.getCamera(bridge.camera);
    viewCamera.getWorldQuaternion(viewQuaternion);
    viewEuler.setFromQuaternion(viewQuaternion, "YXZ");
    answerPanel.rotation.z = THREE.MathUtils.clamp(
      viewEuler.z,
      -THREE.MathUtils.degToRad(30),
      THREE.MathUtils.degToRad(30),
    );
  }

  function update(now) {
    if (uiBlocked) return;
    updateHudPose();
    if (phase === "question") {
      if (answerPoseIsXR !== bridge.renderer.xr.isPresenting) lockAnswerPanelPose();
      stabilizeAnswerPanelRoll();
      updateChoiceHover();
      return;
    }
    if (phase === "selection-feedback") {
      if (answerPoseIsXR !== bridge.renderer.xr.isPresenting) lockAnswerPanelPose();
      stabilizeAnswerPanelRoll();
      updateSelectionFeedback(now);
      return;
    }
    if (phase === "flashing") {
      updateFlashUv();
      const remaining = Math.max(0, Math.ceil((flashEndAt - now) / 1000));
      updateTimer(remaining);
      if (now >= flashEndAt) finishFlash();
      return;
    }
    resetGuideLine();
  }
})();
