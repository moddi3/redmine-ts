// Turns on Page.setBypassCSP for every page of a browser and holds the CDP session open, so a
// recorder's injected pointer and styles render on pages whose CSP refuses them, such as the MCP
// server's consent page. The servers keep sending their CSP. Usage: node bypass-csp.mjs <ws://…/devtools/browser/…>
const ws = new WebSocket(process.argv[2]);
let id = 0;
const send = (method, params = {}, sessionId) =>
  ws.send(JSON.stringify({ id: ++id, method, params, ...(sessionId && { sessionId }) }));
const attached = new Set();

ws.addEventListener("open", () => send("Target.setDiscoverTargets", { discover: true }));
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Target.targetCreated") {
    const target = message.params.targetInfo;
    if (target.type === "page" && !attached.has(target.targetId)) {
      attached.add(target.targetId);
      send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    }
  }
  if (message.method === "Target.attachedToTarget") {
    send("Page.setBypassCSP", { enabled: true }, message.params.sessionId);
  }
  if (message.error) console.error(`bypass-csp: ${JSON.stringify(message.error)}`);
});
ws.addEventListener("close", () => process.exit(0));
