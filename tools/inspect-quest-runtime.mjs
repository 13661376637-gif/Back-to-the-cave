const targetUrl = process.argv[2];

if (!targetUrl) {
  throw new Error("Pass the DevTools WebSocket URL as the first argument.");
}

const expression = `JSON.stringify({
  url: location.href,
  scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
  hasBridge: Boolean(window.__caveVR),
  hasSphere: Boolean(window.__caveVR?.sphere),
  xrPresenting: Boolean(window.__caveVR?.renderer?.xr?.isPresenting),
  xrSessionActive: Boolean(window.__caveVR?.xrSessionActive),
  controllerStatus: window.__caveVR?.controllerStatus ?? null,
  sessionInputs: [...(window.__caveVR?.renderer?.xr?.getSession?.()?.inputSources || [])].map((source) => ({
    handedness: source.handedness,
    targetRayMode: source.targetRayMode,
    profiles: source.profiles,
    hasGamepad: Boolean(source.gamepad),
  })),
  browserGamepads: [...(navigator.getGamepads?.() || [])].filter(Boolean).map((gamepad) => ({
    id: gamepad.id,
    mapping: gamepad.mapping,
    axes: [...gamepad.axes],
    buttons: [...gamepad.buttons].map((button) => ({ pressed: button.pressed, value: button.value })),
  })),
  sphereWorldPosition: window.__caveVR?.sphere?.world?.position?.toArray?.(),
  sphereScale: window.__caveVR?.sphere?.world?.scale?.toArray?.(),
  sphereRotation: window.__caveVR?.sphere?.sphere?.rotation?.toArray?.(),
  vrButton: (() => {
    const button = document.querySelector("#vr-button");
    return button
      ? { hidden: button.hidden, disabled: button.disabled, text: button.textContent }
      : null;
  })(),
})`;

const socket = new WebSocket(targetUrl);
const timeout = setTimeout(() => {
  socket.close();
  process.exitCode = 2;
}, 5000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, returnByValue: true },
  }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;

  clearTimeout(timeout);
  console.log(message.result?.result?.value ?? JSON.stringify(message));
  socket.close();
});
