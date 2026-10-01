import fs from "node:fs";

const targetUrl = process.argv[2];
const outputPath = process.argv[3];
const levelIndex = Number(process.argv[4] || 0);

if (!targetUrl || !outputPath) throw new Error("Pass the DevTools WebSocket URL and output path.");

const expression = `(() => {
  const scene = window.__caveVR?.scene;
  window.__caveVR?.photoRevealGame?.startLevel(${Number.isFinite(levelIndex) ? levelIndex : 0});
  const mainUi = scene?.getObjectByName("retro-spatial-game-ui");
  const answerPanel = scene?.getObjectByName("photo-answer-panel");
  if (!mainUi || !answerPanel) return false;
  mainUi.getWorldPosition(answerPanel.position);
  mainUi.getWorldQuaternion(answerPanel.quaternion);
  mainUi.visible = false;
  answerPanel.visible = true;
  return true;
})()`;

const socket = new WebSocket(targetUrl);
const timeout = setTimeout(() => {
  socket.close();
  process.exitCode = 2;
}, 10000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression } }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id === 1) {
    setTimeout(() => {
      socket.send(JSON.stringify({
        id: 2,
        method: "Page.captureScreenshot",
        params: { format: "png", fromSurface: true },
      }));
    }, 250);
    return;
  }
  if (message.id !== 2) return;
  clearTimeout(timeout);
  fs.writeFileSync(outputPath, Buffer.from(message.result.data, "base64"));
  console.log(outputPath);
  socket.close();
});
