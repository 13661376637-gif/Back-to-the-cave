const [targetUrl, pageUrl] = process.argv.slice(2);

if (!targetUrl || !pageUrl) {
  throw new Error("Pass the DevTools WebSocket URL and game page URL.");
}

const socket = new WebSocket(targetUrl);
const timeout = setTimeout(() => {
  socket.close();
  process.exitCode = 2;
}, 5000);

socket.addEventListener("open", () => {
  socket.send(JSON.stringify({
    id: 1,
    method: "Page.navigate",
    params: { url: pageUrl },
  }));
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== 1) return;

  clearTimeout(timeout);
  console.log(JSON.stringify(message.result ?? message));
  socket.close();
});
