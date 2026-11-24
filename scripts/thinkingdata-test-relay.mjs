import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { proxyThinkingDataSdk } from "../src/lib/thinkingdataSdkProxy.mjs";

const upstreamUrl = process.env.THINKINGDATA_TEST_SERVER_URL;
const appId = process.env.THINKINGDATA_TEST_APP_ID;
const token = process.env.THINKINGDATA_TEST_RELAY_TOKEN;
const port = Number(process.env.THINKINGDATA_RELAY_PORT || 4318);
if (!upstreamUrl || !appId || !token || token.length < 32) {
  throw new Error("Set THINKINGDATA_TEST_SERVER_URL, THINKINGDATA_TEST_APP_ID, and a THINKINGDATA_TEST_RELAY_TOKEN of at least 32 characters.");
}

const server = createServer(async (request, response) => {
  const supplied = Buffer.from(String(request.headers["x-monitor-relay-token"] || ""));
  const expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.writeHead(401, { "content-type": "application/json" }).end('{"code":-1,"msg":"Unauthorized"}');
    return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const url = new URL(request.url, "http://127.0.0.1");
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(key, value);
    }
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks);
    const incoming = new Request(url, { method: request.method, headers, body });
    const result = await proxyThinkingDataSdk(incoming, url.pathname.slice(1).split("/"), {
      upstreamUrl, appId, relayToken: "",
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(502, { "content-type": "application/json" }).end('{"code":-1,"msg":"Relay failed"}');
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`ThinkingData SDK relay listening at http://127.0.0.1:${server.address().port}; only authenticated SDK endpoints are forwarded.`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
}
