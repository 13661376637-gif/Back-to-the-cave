const targetUrl = process.argv[2];

if (!targetUrl) throw new Error("Pass the DevTools WebSocket URL.");

const expression = `(() => {
  const bridge = window.__caveVR;
  const game = bridge?.photoRevealGame;
  const answerPanel = bridge?.scene?.getObjectByName("photo-answer-panel");
  const labels = [];
  answerPanel?.traverse((item) => {
    if (item.name?.startsWith("photo-answer-label-")) {
      labels.push({ name: item.name, hasTexture: Boolean(item.material?.map) });
    }
  });
  return {
    levelTextures: game?.levels?.map((level) => level.texturePath) || [],
    correctAnswers: game?.levels?.map((level) => level.correctAnswerIndex) || [],
    options: game?.levels?.map((level) => level.options) || [],
    answerLabelCount: labels.length,
    labels,
    answerPanelScale: answerPanel?.scale?.toArray?.() || null,
    currentLevel: game?.getCurrentLevelIndex?.() ?? null,
    currentPhase: document.querySelector("#stage")?.dataset?.photoGamePhase || null,
    photoTextureSize: game?.uniforms?.photoTexture?.value?.image
      ? [game.uniforms.photoTexture.value.image.width, game.uniforms.photoTexture.value.image.height]
      : null,
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
    params: { expression, returnByValue: true },
  }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;
  clearTimeout(timeout);
  console.log(JSON.stringify(message.result?.result?.value ?? message));
  socket.close();
});
