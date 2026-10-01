const targetUrl = process.argv[2];

if (!targetUrl) {
  throw new Error("Pass the DevTools WebSocket URL as the first argument.");
}

const expression = `(async () => {
  const stage = document.querySelector("#stage");
  const sphere = document.querySelector("[data-geodesic-sphere]");
  stage.classList.add("is-map-ready");
  window.dispatchEvent(new CustomEvent("cave-map-ready", {
    detail: { levelId: "level-one" },
  }));
  const sendTarget = () => sphere.dispatchEvent(new CustomEvent("sphere-rotation", {
    detail: { x: -0.16, y: 1.42, dragging: false },
  }));
  sendTarget();
  await new Promise((resolve) => setTimeout(resolve, 340));
  sendTarget();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const visibleShadowPositions = [];
  window.__caveVR.scene.traverse((item) => {
    if (item.visible && item.name.includes("center-wall-shadow")) {
      visibleShadowPositions.push(item.position.toArray());
    }
  });
  return {
    gameState: stage.dataset.gameState,
    result: stage.dataset.result,
    isSuccess: stage.classList.contains("is-success"),
    visibleShadows: visibleShadowPositions.length,
    shadowPositions: visibleShadowPositions,
  };
})()`;

const socket = new WebSocket(targetUrl);
const timeout = setTimeout(() => {
  socket.close();
  process.exitCode = 2;
}, 8000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true },
  }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;

  clearTimeout(timeout);
  console.log(JSON.stringify(message.result?.result?.value ?? message));
  socket.close();
});
