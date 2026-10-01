(() => {
  const THREE = window.THREE;
  const bridge = window.__caveVR;
  const button = document.querySelector("#vr-button");
  const stage = document.querySelector("#stage");
  if (!THREE || !bridge || !button || !stage) return;

  let session = null;
  let controllers = [];
  let activeController = null;
  let grabbing = false;
  const grabStartPosition = new THREE.Vector3();
  const grabStartQuaternion = new THREE.Quaternion();
  const grabStartRotation = { x: -0.12, y: 0.36 };
  const sessionInputEvents = ["selectstart", "selectend", "squeezestart", "squeezeend"];
  let inputFrameHandle = null;
  let unregisterInputFrameCallback = null;

  button.textContent = "CHECKING VR";
  const supportCheck = navigator.xr?.isSessionSupported?.("immersive-vr");
  if (supportCheck) {
    supportCheck.then((supported) => {
      button.hidden = !supported;
      button.disabled = !supported;
      button.textContent = supported ? "ENTER VR" : "VR NOT AVAILABLE";
    }).catch(() => {
      button.hidden = true;
    });
  } else {
    button.hidden = true;
  }

  button.addEventListener("click", async () => {
    if (session) {
      await session.end();
      return;
    }
    await enterVR();
  });

  async function enterVR() {
    if (!navigator.xr || !bridge.sphere) return;
    button.disabled = true;
    try {
      session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking", "dom-overlay"],
        domOverlay: { root: stage },
      });
      controllers = createControllers();
      bindSessionInputEvents();
      bridge.xrSessionActive = true;
      bridge.renderer.xr.setReferenceSpaceType("local-floor");
      await bridge.renderer.xr.setSession(session);
      syncInputSources();
      stage.classList.add("is-xr");
      bridge.sphere.enterXR();
      startInputLoop();
      session.addEventListener("end", leaveVR, { once: true });
    } catch (error) {
      console.warn("Unable to enter WebXR.", error);
      unbindSessionInputEvents();
      disposeControllers();
      bridge.xrSessionActive = false;
      session = null;
      button.disabled = false;
    }
  }

  function createControllers() {
    return [0, 1].map((index) => {
      const targetRay = bridge.renderer.xr.getController(index);
      const grip = bridge.renderer.xr.getControllerGrip(index);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -1.2),
        ]),
        new THREE.LineBasicMaterial({ color: 0x77ecff, transparent: true, opacity: 0.64 }),
      );
      line.name = "controller-guide-line";
      line.scale.z = 4.5;
      line.userData.defaultScaleZ = 4.5;
      line.material.depthTest = false;
      line.material.depthWrite = false;
      line.renderOrder = 560;
      targetRay.add(line);
      bridge.scene.add(targetRay, grip);

      const state = {
        index,
        expectedHandedness: index === 0 ? "left" : "right",
        targetRay,
        grip,
        source: null,
        handedness: null,
        grabInputs: new Set(),
        polledGrab: false,
        polledTrigger: false,
        lastStickFeedbackAt: 0,
      };
      const onConnected = (event) => {
        state.source = event.data;
        state.handedness = event.data?.handedness || null;
        if (isRightController(state, event.data)) {
          bridge.sphere.bindController?.(targetRay, grip);
          bridge.photoRevealGame?.bindController?.(targetRay);
          bridge.gameUI?.bindController?.(targetRay);
        }
      };
      const onDisconnected = () => {
        state.grabInputs.clear();
        state.polledGrab = false;
        state.polledTrigger = false;
        if (isRightController(state)) {
          bridge.sphere.setLightEnabled?.(false);
          bridge.photoRevealGame?.bindController?.(null);
          bridge.gameUI?.bindController?.(null);
        }
        if (activeController === state) stopGrab();
        state.source = null;
      };
      state.onConnected = onConnected;
      state.onDisconnected = onDisconnected;
      targetRay.addEventListener("connected", onConnected);
      targetRay.addEventListener("disconnected", onDisconnected);
      return state;
    });
  }

  function bindSessionInputEvents() {
    sessionInputEvents.forEach((type) => session.addEventListener(type, handleSessionInput));
    session.addEventListener("inputsourceschange", syncInputSources);
  }

  function unbindSessionInputEvents() {
    if (!session) return;
    sessionInputEvents.forEach((type) => session.removeEventListener(type, handleSessionInput));
    session.removeEventListener("inputsourceschange", syncInputSources);
  }

  function handleSessionInput(event) {
    const state = findControllerState(event.inputSource);
    if (!state) return;
    state.source = event.inputSource;
    state.handedness = event.inputSource?.handedness || state.handedness;
    if (bridge.sphere?.isFlashlight && isRightController(state, event.inputSource)) {
      if (event.type === "selectstart") {
        const uiHandled = bridge.gameUI?.handleTriggerDown?.() || false;
        const gameHandled = uiHandled ? false : bridge.photoRevealGame?.handleTriggerDown?.() || false;
        bridge.sphere.setLightEnabled(uiHandled ? false : gameHandled ? bridge.photoRevealGame.isFlashActive() : true);
        pulse(state, 0.24, 55);
      }
      if (event.type === "selectend") {
        const uiHandled = bridge.gameUI?.handleTriggerUp?.() || false;
        if (!uiHandled) bridge.photoRevealGame?.handleTriggerUp?.();
        bridge.sphere.setLightEnabled(false);
      }
      if (event.type === "squeezestart" && !bridge.gameUI?.isVisible?.() && !bridge.photoRevealGame?.isFlashActive?.()) {
        bridge.sphere.setLightEnabled(true);
      }
      if (event.type === "squeezeend" && !bridge.photoRevealGame?.isFlashActive?.()) {
        bridge.sphere.setLightEnabled(false);
      }
      return;
    }
    if (event.type === "selectstart") beginGrab(state, "select", event.frame);
    if (event.type === "squeezestart") beginGrab(state, "squeeze", event.frame);
    if (event.type === "selectend") endGrab(state, "select");
    if (event.type === "squeezeend") endGrab(state, "squeeze");
  }

  function beginGrab(state, input, xrFrame) {
    if (!bridge.sphere) return false;
    if (activeController && activeController !== state) stopGrab();
    const pose = getControllerPose(state, xrFrame);
    if (!pose) return false;
    state.grabInputs.add(input);
    activeController = state;
    grabbing = true;
    grabStartPosition.copy(pose.position);
    grabStartQuaternion.copy(pose.quaternion);
    grabStartRotation.x = bridge.sphere.sphere.rotation.x;
    grabStartRotation.y = bridge.sphere.sphere.rotation.y;
    pulse(state, 0.18, 45);
    return true;
  }

  function endGrab(state, input) {
    state.grabInputs.delete(input);
    if (activeController === state && state.grabInputs.size === 0) stopGrab();
  }

  function stopGrab() {
    grabbing = false;
    if (activeController) activeController.grabInputs.clear();
    activeController = null;
  }

  function startInputLoop() {
    if (typeof bridge.registerFrameCallback === "function") {
      unregisterInputFrameCallback = bridge.registerFrameCallback((_time, xrFrame) => {
        if (session && xrFrame) updateControllers(performance.now(), xrFrame);
      });
      return;
    }

    const update = (time, xrFrame) => {
      updateControllers(time, xrFrame);
      if (session) inputFrameHandle = session.requestAnimationFrame(update);
    };
    inputFrameHandle = session.requestAnimationFrame(update);
  }

  function stopInputLoop() {
    unregisterInputFrameCallback?.();
    unregisterInputFrameCallback = null;
    if (session && inputFrameHandle !== null) {
      try {
        session.cancelAnimationFrame(inputFrameHandle);
      } catch {
        // The session may already be ending.
      }
    }
    inputFrameHandle = null;
  }

  function updateControllers(_time, xrFrame) {
    if (!session || !bridge.sphere) return;
    syncInputSources();

    if (bridge.sphere.updateControllerAim) {
      const rightController = controllers.find((state) => state.source && isRightController(state))
        || controllers.find((state) => state.source)
        || controllers.find((state) => state.expectedHandedness === "right");
      bridge.sphere.updateControllerAim(rightController?.targetRay, rightController?.grip);
    }

    if (grabbing && activeController) {
      const pose = getControllerPose(activeController, xrFrame);
      if (pose) {
        const positionDelta = pose.position.clone().sub(grabStartPosition);
        const rotationDelta = grabStartQuaternion.clone().invert().multiply(pose.quaternion);
        const twist = new THREE.Euler().setFromQuaternion(rotationDelta, "YXZ");
        bridge.sphere.setRotation(
          grabStartRotation.x - positionDelta.y * 1.7,
          grabStartRotation.y - positionDelta.x * 1.7 + twist.z * 0.55,
        );
      }
    }

    const sessionSources = Array.from(session.inputSources || []);
    const inputEntries = sessionSources.length
      ? sessionSources.map((source, index) => ({ source, index, state: findControllerState(source) }))
      : controllers.map((state, index) => ({ source: state.source, index, state }));
    const liveInputs = inputEntries
      .map((source, index) => ({
        source: source.source,
        index: source.index ?? index,
        state: source.state,
        input: getActiveGamepad(source.source, source.index ?? index),
      }))
      .filter(({ input }) => input);

    liveInputs.forEach(({ source, state, input }) => {
      if (!state) return;
      state.source = source;
      state.handedness = source?.handedness || state.handedness;
      if (!input) return;
      const { gamepad, x: horizontal, y: vertical } = input;
      const triggerPressed = Boolean(gamepad.buttons?.[0]?.pressed);
      const gripPressed = Boolean(gamepad.buttons?.[1]?.pressed);
      const polledGrabPressed = triggerPressed || gripPressed;
      if (bridge.sphere?.isFlashlight && isRightController(state, source)) {
        if (triggerPressed !== state.polledTrigger) {
          state.polledTrigger = triggerPressed;
          if (triggerPressed) {
            const uiHandled = bridge.gameUI?.handleTriggerDown?.() || false;
            if (!uiHandled) bridge.photoRevealGame?.handleTriggerDown?.();
          } else {
            const uiHandled = bridge.gameUI?.handleTriggerUp?.() || false;
            if (!uiHandled) bridge.photoRevealGame?.handleTriggerUp?.();
          }
        }
        if (polledGrabPressed !== state.polledGrab) {
          state.polledGrab = polledGrabPressed;
        }
        bridge.sphere.setLightEnabled(
          bridge.gameUI?.isVisible?.()
            ? false
            : polledGrabPressed,
        );
        return;
      }
      if (polledGrabPressed && !state.polledGrab) {
        state.polledGrab = beginGrab(state, "polled", xrFrame);
      } else if (!polledGrabPressed && state.polledGrab) {
        state.polledGrab = false;
        endGrab(state, "polled");
      }
      const x = applyDeadzone(horizontal, 0.12);
      const y = applyDeadzone(vertical, 0.12);
      if (x || y) {
        bridge.sphere.nudgeRotation(y * 0.032, x * 0.042);
        const now = performance.now();
        if (now - state.lastStickFeedbackAt > 180) {
          pulse(state, 0.08, 18);
          state.lastStickFeedbackAt = now;
        }
      }
    });

    bridge.controllerStatus = {
      sourceCount: session.inputSources.length,
      xrFrameActive: Boolean(xrFrame),
      controllers: liveInputs.map(({ source, input }) => ({
        handedness: source?.handedness || "none",
        mapping: input.gamepad.mapping || "",
        axes: Array.from(input.gamepad.axes || []),
        activeAxes: [input.x, input.y],
        buttons: Array.from(input.gamepad.buttons || [], (item) => ({
          pressed: item.pressed,
          value: item.value,
        })),
      })),
    };
  }

  function syncInputSources() {
    const inputSources = Array.from(session?.inputSources || []);
    const assigned = new Set();

    controllers.forEach((state) => {
      if (state.source && inputSources.includes(state.source) && !assigned.has(state.source)) {
        assigned.add(state.source);
        state.handedness = state.source.handedness || state.handedness;
      } else {
        state.source = null;
      }
    });

    controllers.forEach((state) => {
      if (state.source) return;
      state.source = inputSources.find((source) => (
        !assigned.has(source) && source.handedness === state.expectedHandedness
      )) || null;
      if (state.source) assigned.add(state.source);
    });

    controllers.forEach((state) => {
      if (state.source) return;
      state.source = inputSources.find((source) => !assigned.has(source)) || null;
      if (state.source) assigned.add(state.source);
    });

    controllers.forEach((state) => {
      state.handedness = state.source?.handedness || state.handedness;
      if (state.source && isRightController(state, state.source)) {
        bridge.sphere.bindController?.(state.targetRay, state.grip);
        bridge.photoRevealGame?.bindController?.(state.targetRay);
        bridge.gameUI?.bindController?.(state.targetRay);
      }
    });
  }

  function isRightController(state, source = state?.source) {
    const handedness = source?.handedness || state?.handedness;
    if (handedness) return handedness === "right";
    return Boolean(source && state?.expectedHandedness === "right");
  }

  function findControllerState(inputSource) {
    return controllers.find((state) => state.source === inputSource)
      || controllers.find((state) => inputSource?.handedness === state.expectedHandedness)
      || controllers.find((state) => !state.source)
      || null;
  }

  function getControllerPose(state, xrFrame) {
    const referenceSpace = bridge.renderer.xr.getReferenceSpace?.();
    const sourceSpace = state.source?.gripSpace || state.source?.targetRaySpace;
    const pose = xrFrame && referenceSpace && sourceSpace
      ? xrFrame.getPose(sourceSpace, referenceSpace)
      : null;
    if (pose) {
      const { position, orientation } = pose.transform;
      return {
        position: new THREE.Vector3(position.x, position.y, position.z),
        quaternion: new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
      };
    }
    if (!state.grip.visible) return null;
    return {
      position: state.grip.position.clone(),
      quaternion: state.grip.quaternion.clone(),
    };
  }

  function resolveInputSource(state) {
    if (state.source?.gamepad) return state.source;
    const inputSources = session?.inputSources || [];
    const byHand = state.handedness
      ? inputSources.find((source) => source.handedness === state.handedness)
      : null;
    const fallback = inputSources[state.index];
    state.source = byHand || fallback || state.source;
    return state.source;
  }

  function getBrowserGamepad(index) {
    const gamepads = navigator.getGamepads?.() || [];
    return gamepads.filter(Boolean)[index] || null;
  }

  function getActiveGamepad(source, index) {
    const candidates = [source?.gamepad, getBrowserGamepad(index)].filter(Boolean);
    let selected = null;
    candidates.forEach((gamepad) => {
      const axes = getStickAxes(gamepad.axes || []);
      if (!selected || axes.magnitude > selected.magnitude) selected = { gamepad, ...axes };
    });
    return selected;
  }

  function getStickAxes(axes) {
    const pairs = [];
    if (axes.length >= 2) pairs.push([0, 1]);
    if (axes.length >= 4) pairs.push([2, 3]);
    let selected = { x: 0, y: 0, magnitude: 0 };
    pairs.forEach(([xIndex, yIndex]) => {
      const x = Number.isFinite(axes[xIndex]) ? axes[xIndex] : 0;
      const y = Number.isFinite(axes[yIndex]) ? axes[yIndex] : 0;
      const magnitude = Math.abs(x) + Math.abs(y);
      if (magnitude > selected.magnitude) selected = { x, y, magnitude };
    });
    return selected;
  }

  function applyDeadzone(value, deadzone) {
    if (Math.abs(value) <= deadzone) return 0;
    const sign = Math.sign(value);
    return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
  }

  function pulse(state, intensity, duration) {
    const gamepad = getActiveGamepad(state.source, state.index)?.gamepad;
    const actuator = gamepad?.hapticActuators?.[0];
    const result = actuator?.pulse?.(intensity, duration);
    result?.catch?.(() => {});
  }

  function leaveVR() {
    stopInputLoop();
    stopGrab();
    unbindSessionInputEvents();
    disposeControllers();
    bridge.xrSessionActive = false;
    bridge.sphere.exitXR();
    stage.classList.remove("is-xr");
    session = null;
    button.disabled = false;
    button.textContent = "ENTER VR";
  }

  function disposeControllers() {
    controllers.forEach(({ targetRay, grip, onConnected, onDisconnected }) => {
      targetRay.removeEventListener("connected", onConnected);
      targetRay.removeEventListener("disconnected", onDisconnected);
      bridge.scene.remove(targetRay, grip);
      targetRay.children.forEach((child) => {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      });
    });
    controllers = [];
  }
})();
