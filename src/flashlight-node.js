(() => {
  const THREE = window.THREE;
  const bridge = window.__caveVR;
  const mount = document.querySelector("[data-geodesic-sphere]");
  if (!THREE || !bridge || !mount) return;

  const {
    AdditiveBlending,
    BoxGeometry,
    CylinderGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshStandardMaterial,
    PointLight,
    ShaderMaterial,
    TorusGeometry,
    Vector3,
  } = THREE;

  const CENTER_WALL_Z = () => (bridge.centerWallZ || -8) + (bridge.rig?.position.z || 0);
  const BEAM_START = 0.48;
  const WALL_HEIGHT = bridge.roomSize?.height || 9.65;
  const XR_VIEW_OFFSET = new Vector3(0.26, -0.16, -0.72);
  const XR_CONTROLLER_OFFSET = new Vector3(0, 0.035, -0.12);
  const world = new Group();
  const flashlight = new Group();
  const beamGroup = new Group();
  beamGroup.name = "flashlight-cone-group";
  const beamUniforms = {
    beamOpacity: { value: 0.17 },
  };
  const beamMaterial = new ShaderMaterial({
    uniforms: beamUniforms,
    transparent: true,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: DoubleSide,
    vertexShader: `
      varying vec2 vBeamUv;
      void main() {
        vBeamUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform float beamOpacity;
      varying vec2 vBeamUv;
      void main() {
        // The broad wall end fades over a long distance so its diamond cross-section is invisible.
        float wallEndFade = smoothstep(0.0, 0.46, vBeamUv.y);
        float lensEndFade = smoothstep(0.0, 0.14, 1.0 - vBeamUv.y);
        float alpha = beamOpacity * wallEndFade * lensEndFade;
        gl_FragColor = vec4(vec3(1.0), alpha);
      }
    `,
  });
  // Four open faces form the transparent diamond beam. +Y is the narrow lens end.
  const beam = new Mesh(new CylinderGeometry(0.018, 1, 1, 4, 1, true), beamMaterial);
  beam.name = "flashlight-diamond-beam";
  beam.renderOrder = 18;
  const lensLight = new PointLight(0xffffff, 5.5, 15, 2);
  const darkMaterial = new MeshStandardMaterial({ color: 0x101723, roughness: 0.36, metalness: 0.78, flatShading: true });
  const edgeMaterial = new MeshStandardMaterial({ color: 0x526174, roughness: 0.24, metalness: 0.9, flatShading: true });
  const gripMaterial = new MeshStandardMaterial({ color: 0x202b3a, roughness: 0.62, metalness: 0.36, flatShading: true });
  const lensMaterial = new MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 2.4,
    roughness: 0.12,
    metalness: 0.08,
    flatShading: true,
  });

  world.name = "flashlight-world";
  flashlight.name = "low-poly-flashlight";
  world.position.set(0, -2.38, 2.72);
  world.scale.setScalar(0.82);
  world.add(flashlight);
  bridge.scene.add(world, beamGroup);

  buildFlashlightModel();
  beamGroup.add(beam);
  flashlight.add(lensLight);
  beamGroup.visible = false;
  world.visible = false;

  let controllerTargetRay = null;
  let lightEnabled = true;
  let revealRadiusUv = 0.34;
  let hasRevealTarget = false;
  const revealTarget = new Vector3();
  let beamFade = 1;
  let lastBeamFrameTime = performance.now();
  let interactionEnabled = true;
  let targetRotationX = -0.12;
  let targetRotationY = 0.36;
  let desktopDragging = false;
  const desktopInteractionEnabled = !navigator.xr;

  const flashlightBridge = {
    world,
    sphere: flashlight,
    isFlashlight: true,
    usesControllerAim: true,
    bindController(targetRay) {
      if (!targetRay || (controllerTargetRay === targetRay && flashlight.parent === bridge.scene)) return;
      controllerTargetRay = targetRay;
      if (flashlight.parent) flashlight.parent.remove(flashlight);
      bridge.scene.add(flashlight);
      flashlight.scale.setScalar(0.38);
      flashlight.position.set(0, 0, 0);
      flashlight.rotation.set(0, 0, 0);
      flashlight.visible = true;
    },
    enterXR() {
      lightEnabled = false;
      setLightEnabled(false);
      world.visible = true;
      flashlight.visible = true;
      updateViewerFallback();
    },
    exitXR() {
      if (flashlight.parent) flashlight.parent.remove(flashlight);
      world.add(flashlight);
      controllerTargetRay = null;
      flashlight.scale.setScalar(1);
      flashlight.position.set(0, 0, 0);
      flashlight.rotation.set(0, 0, 0);
      lightEnabled = true;
      setLightEnabled(true);
      world.visible = mount.dataset.mapReady === "true";
    },
    setLightEnabled(enabled) {
      setLightEnabled(enabled);
    },
    setRevealRadius(radius) {
      if (!Number.isFinite(radius) || radius <= 0) return;
      revealRadiusUv = radius;
      flashlightBridge.updateControllerAim();
    },
    setRevealTarget(point) {
      if (!point?.isVector3) return;
      revealTarget.copy(point);
      hasRevealTarget = true;
      flashlightBridge.updateControllerAim();
    },
    clearRevealTarget() {
      hasRevealTarget = false;
    },
    updateControllerAim(targetRay = controllerTargetRay) {
      if (targetRay?.visible) {
        updateAim(targetRay);
      } else {
        updateViewerFallback();
      }
    },
    setRotation(x, y) {
      targetRotationX = clamp(x, -0.95, 0.95);
      targetRotationY = y;
      if (!controllerTargetRay) {
        flashlight.rotation.set(targetRotationX, targetRotationY - 0.36, 0);
        updateAim(flashlight);
      }
    },
    nudgeRotation(x, y) {
      flashlightBridge.setRotation(targetRotationX + x, targetRotationY + y);
    },
  };
  bridge.registerSphere(flashlightBridge);

  bridge.registerFrameCallback?.((time = performance.now()) => {
    updateBeamAnimation(time);
    if (bridge.xrSessionActive || bridge.renderer.xr.isPresenting) {
      flashlightBridge.updateControllerAim();
    } else {
      updateAim(flashlight);
    }
  });

  window.addEventListener("cave-map-ready", () => {
    mount.dataset.mapReady = "true";
    world.visible = true;
  });

  mount.addEventListener("pointerdown", (event) => {
    if (!desktopInteractionEnabled || bridge.xrSessionActive || !interactionEnabled) return;
    desktopDragging = true;
    mount.setPointerCapture?.(event.pointerId);
    updateDesktopAim(event);
  });
  mount.addEventListener("pointermove", (event) => {
    if (desktopInteractionEnabled && desktopDragging) updateDesktopAim(event);
  });
  mount.addEventListener("pointerup", () => {
    desktopDragging = false;
  });
  mount.addEventListener("pointercancel", () => {
    desktopDragging = false;
  });

  mount.addEventListener("sphere-lock", () => {
    interactionEnabled = false;
    setLightEnabled(false);
  });

  mount.addEventListener("sphere-reset", () => {
    interactionEnabled = true;
    targetRotationX = -0.12;
    targetRotationY = 0.36;
    if (!controllerTargetRay) setLightEnabled(true);
    dispatchAim();
  });

  function buildFlashlightModel() {
    const body = new Mesh(new CylinderGeometry(0.21, 0.25, 0.82, 8), darkMaterial);
    body.rotation.x = -Math.PI / 2;
    body.position.z = 0.06;

    const rear = new Mesh(new CylinderGeometry(0.18, 0.2, 0.13, 8), edgeMaterial);
    rear.rotation.x = -Math.PI / 2;
    rear.position.z = 0.5;

    const bezel = new Mesh(new CylinderGeometry(0.28, 0.25, 0.13, 8), edgeMaterial);
    bezel.rotation.x = -Math.PI / 2;
    bezel.position.z = -0.42;

    const lens = new Mesh(new CylinderGeometry(0.205, 0.205, 0.035, 12), lensMaterial);
    lens.rotation.x = -Math.PI / 2;
    lens.position.z = -0.495;

    const ring = new Mesh(new TorusGeometry(0.235, 0.022, 4, 8), edgeMaterial);
    ring.position.z = -0.49;

    const grip = new Mesh(new BoxGeometry(0.21, 0.34, 0.28), gripMaterial);
    grip.position.set(0, 0.22, 0.09);
    grip.rotation.x = -0.12;

    const switchBase = new Mesh(new BoxGeometry(0.105, 0.055, 0.14), edgeMaterial);
    switchBase.position.set(0, 0.405, 0.04);
    const switchTop = new Mesh(new BoxGeometry(0.06, 0.035, 0.08), lensMaterial);
    switchTop.position.set(0, 0.448, 0.04);

    flashlight.add(body, rear, bezel, lens, ring, grip, switchBase, switchTop);
  }

  function setLightEnabled(enabled) {
    lightEnabled = Boolean(enabled);
    beamGroup.visible = lightEnabled && (world.visible || Boolean(controllerTargetRay));
    // The first rendered XR frame must already show the transparent beam.
    beamFade = lightEnabled ? Math.max(beamFade, 0.9) : 0;
    beamUniforms.beamOpacity.value = lightEnabled ? 0.17 * beamFade : 0;
    lensLight.intensity = lightEnabled ? 5.5 : 0.18;
    dispatchAim();
  }

  function updateAim(source) {
    if (!source) return;
    const origin = source.getWorldPosition(new Vector3());
    const quaternion = source.getWorldQuaternion(new THREE.Quaternion());
    if (source !== flashlight && controllerTargetRay) {
      flashlight.position.copy(origin).add(XR_CONTROLLER_OFFSET.clone().applyQuaternion(quaternion));
      flashlight.quaternion.copy(quaternion);
      updateAimFromPose(flashlight.position, quaternion, origin);
      return;
    }
    updateAimFromPose(origin, quaternion);
  }

  function updateViewerFallback() {
    const xrCamera = bridge.renderer.xr.getCamera?.() || bridge.camera;
    if (!xrCamera) return;
    const origin = xrCamera.getWorldPosition(new Vector3());
    const quaternion = xrCamera.getWorldQuaternion(new THREE.Quaternion());
    const offset = XR_VIEW_OFFSET.clone().applyQuaternion(quaternion);
    flashlight.position.copy(origin).add(offset);
    flashlight.quaternion.copy(quaternion);
    flashlight.scale.setScalar(0.38);
    flashlight.visible = true;
    updateAimFromPose(flashlight.position, quaternion);
  }

  function updateAimFromPose(origin, quaternion, rayOrigin = origin) {
    const direction = new Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
    const horizontalLength = Math.hypot(direction.x, direction.z) || 1;
    targetRotationY = normalizeAngle(0.36 + Math.atan2(direction.x, -direction.z));
    targetRotationX = clamp(-0.12 + Math.atan2(direction.y, horizontalLength), -0.95, 0.95);

    const wallZ = CENTER_WALL_Z();
    const distanceToWall = (wallZ - rayOrigin.z) / direction.z;
    if (distanceToWall > BEAM_START) {
      const target = hasRevealTarget
        ? revealTarget
        : rayOrigin.clone().addScaledVector(direction, distanceToWall);
      const beamDirection = target.clone().sub(origin).normalize();
      const distanceToTarget = target.distanceTo(origin);
      const beamLength = Math.max(0.1, distanceToTarget - BEAM_START);
      const wallRadius = revealRadiusUv * WALL_HEIGHT;
      beamGroup.position.copy(origin).addScaledVector(beamDirection, BEAM_START + beamLength / 2);
      beamGroup.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), beamDirection.clone().negate());
      beam.scale.set(wallRadius, beamLength, wallRadius);
      const showLight = lightEnabled && (world.visible || Boolean(controllerTargetRay));
      beamGroup.visible = showLight;
    } else {
      beamGroup.visible = false;
    }
    dispatchAim();
  }

  function updateBeamAnimation(time) {
    const delta = Math.min(50, Math.max(0, time - lastBeamFrameTime));
    lastBeamFrameTime = time;
    if (!lightEnabled) {
      beamFade = 0;
      beamUniforms.beamOpacity.value = 0;
      return;
    }
    beamFade = Math.min(1, beamFade + delta / 120);
    const breathe = 0.96 + Math.sin(time * 0.012) * 0.04;
    beamUniforms.beamOpacity.value = 0.17 * beamFade * breathe;
  }

  function updateDesktopAim(event) {
    const rect = mount.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ny = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    targetRotationY = 0.36 + nx * 0.9;
    targetRotationX = clamp(-0.12 + ny * 0.6, -0.95, 0.95);
    flashlight.rotation.set(targetRotationX, targetRotationY - 0.36, 0);
    updateAim(flashlight);
  }

  function dispatchAim() {
    mount.dispatchEvent(new CustomEvent("sphere-rotation", {
      detail: { x: targetRotationX, y: targetRotationY, dragging: desktopDragging },
    }));
  }

  function normalizeAngle(value) {
    const fullTurn = Math.PI * 2;
    return ((value % fullTurn) + fullTurn) % fullTurn;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
})();
