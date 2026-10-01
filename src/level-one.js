(() => {
  const stage = document.querySelector("#stage");
  const sphere = document.querySelector("[data-geodesic-sphere]");
  const successFeedback = document.querySelector("[data-success-feedback]");
  const successKicker = document.querySelector(".success-kicker");
  const successTitle = document.querySelector("[data-success-title]");
  const successCopy = document.querySelector("[data-success-copy]");
  if (!stage || !sphere) return;

  const fullTurn = Math.PI * 2;
  const levels = {
    "level-one": {
      successEvent: "level-one-success",
      toleranceYaw: 0.34,
      tolerancePitch: 0.32,
      stableTime: 260,
      masks: ["first", "not", "none"],
      targets: [
        {
          id: "danger",
          angle: 1.42,
          pitch: -0.16,
          title: "Danger Narrative",
          copy: "The male individual did carry weapons into the station",
          successTitle: "Level One Complete",
          successCopy: "The first hidden cut is established. Entering the final level.",
          active: ["first", "not", "none"],
        },
      ],
    },
    final: {
      successEvent: "final-level-success",
      toleranceYaw: 0.3,
      tolerancePitch: 0.28,
      stableTime: 320,
      masks: [
        "final-rule",
        "final-full",
        "final-entry",
        "final-return",
        "final-media",
        "final-edit-one-a",
        "final-edit-one-b",
        "final-edit-two",
        "final-source",
        "final-question",
        "final-title",
        "final-attitude",
      ],
      targets: [
        {
          id: "institution-arrogance",
          angle: 1.04,
          pitch: -0.28,
          title: "Institution Narrative",
          copy: "Visitor Expelled After Questioning Artwork",
          successTitle: "Final Level Complete",
          successCopy: "Rules, crowding, footage limits, and edits were hidden. The event reads as institutional arrogance.",
          active: [
            "final-rule",
            "final-full",
            "final-entry",
            "final-return",
            "final-media",
            "final-edit-one-a",
            "final-edit-one-b",
            "final-edit-two",
            "final-source",
          ],
        },
        {
          id: "visitor-broke-rules",
          angle: 4.18,
          pitch: 0.14,
          title: "Rule Violation Narrative",
          copy: "Visitor Entered From The Exit While The Room Was Full",
          successTitle: "Final Level Complete",
          successCopy: "Questions, title framing, worker tone, and edits were hidden. The event reads as a rule violation.",
          active: ["final-question", "final-title", "final-attitude", "final-media", "final-edit-one-a", "final-edit-one-b", "final-edit-two", "final-source"],
        },
      ],
    },
  };

  let activeLevel = levels["level-one"];
  let activeLevelId = "level-one";
  let rotation = { x: -0.12, y: 0.36 };
  let candidate = null;
  let candidateSince = 0;
  let locked = false;
  let mapReady = stage.classList.contains("is-map-ready");

  sphere.addEventListener("sphere-rotation", (event) => {
    rotation = event.detail;
    updateGameplay(performance.now());
  });

  window.addEventListener("cave-map-ready", (event) => {
    const levelId = event.detail?.levelId || stage.dataset.level || "level-one";
    if (levelId !== activeLevelId) return;
    mapReady = true;
  });

  window.addEventListener("cave-level-change", (event) => {
    const levelId = event.detail?.level?.id || stage.dataset.level || "level-one";
    activeLevelId = levels[levelId] ? levelId : "level-one";
    activeLevel = levels[activeLevelId];
    candidate = null;
    candidateSince = 0;
    locked = false;
    mapReady = false;
    hideSuccessFeedback();
    sphere.dispatchEvent(new CustomEvent("sphere-reset"));
  });

  function updateGameplay(now) {
    if (!mapReady && stage.classList.contains("is-map-ready")) mapReady = true;

    if (mapReady && !locked) {
      renderShadows();
      checkTarget(now);
    }
  }

  function tick(now) {
    const xr = window.__caveVR;
    if (!xr?.xrSessionActive && !xr?.renderer?.xr?.isPresenting) updateGameplay(now);
    requestAnimationFrame(tick);
  }

  window.__caveVR?.registerFrameCallback?.((_elapsed, xrFrame) => {
    if (xrFrame) updateGameplay(performance.now());
  });

  function checkTarget(now) {
    const closest = activeLevel.targets
      .map((target) => ({
        target,
        yaw: circularDistance(rotation.y, target.angle),
        pitch: Math.abs(rotation.x - target.pitch),
      }))
      .sort((a, b) => a.yaw + a.pitch * 0.7 - b.yaw - b.pitch * 0.7)[0];

    const matched = closest.yaw < activeLevel.toleranceYaw && closest.pitch < activeLevel.tolerancePitch;
    if (!matched) {
      candidate = null;
      candidateSince = 0;
      return;
    }

    if (candidate !== closest.target.id) {
      candidate = closest.target.id;
      candidateSince = now;
    }
    const progress = Math.min(1, (now - candidateSince) / activeLevel.stableTime);
    if (progress >= 1) lock(closest.target);
  }

  function renderShadows() {
    window.dispatchEvent(new CustomEvent("cave-shadow-state", {
      detail: { rotation, levelId: activeLevelId },
    }));
  }

  function lock(target) {
    locked = true;
    window.dispatchEvent(new CustomEvent("cave-shadow-state", {
      detail: {
        rotation,
        levelId: activeLevelId,
      },
    }));
    sphere.dispatchEvent(new CustomEvent("sphere-lock"));
    stage.dataset.result = target.id;
    stage.dataset.gameState = "success";
    stage.classList.add("is-success");
    showSuccessFeedback(target);
    window.dispatchEvent(new CustomEvent(activeLevel.successEvent, {
      detail: { result: target.id, target, levelId: activeLevelId },
    }));
  }

  function showSuccessFeedback(target) {
    if (successKicker) successKicker.textContent = activeLevelId === "final" ? "Final Match" : "Match Found";
    if (successTitle) successTitle.textContent = target.successTitle;
    if (successCopy) successCopy.textContent = target.successCopy;
    if (successFeedback) successFeedback.setAttribute("aria-hidden", "false");
  }

  function hideSuccessFeedback() {
    stage.classList.remove("is-success");
    if (successFeedback) successFeedback.setAttribute("aria-hidden", "true");
  }

  function circularDistance(a, b) {
    const difference = Math.abs(normalize(a) - normalize(b));
    return Math.min(difference, fullTurn - difference);
  }

  function normalize(value) {
    return ((value % fullTurn) + fullTurn) % fullTurn;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  requestAnimationFrame(tick);
})();
