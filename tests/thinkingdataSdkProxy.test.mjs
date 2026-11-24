import assert from "node:assert/strict";
import test from "node:test";
import { proxyThinkingDataSdk } from "../src/lib/thinkingdataSdkProxy.mjs";

const configuration = { upstreamUrl: "https://sdk.example.test", appId: "debug-appid" };

test("SDK proxy preserves signed request bytes and response signatures", async () => {
  const body = '{"request_params":{"#device_id":"test-browser"},"template_code":"td_strategy"}';
  const request = new Request("https://monitor.example.test/api/thinkingdata/sdk/v1/remote-config/debug", {
    method: "POST", body,
    headers: {
      "content-type": "application/json", appid: "debug-appid", device_id: "test-browser",
      template_code: "td_strategy", sign: "request-signature", timestamp: "123",
      cookie: "session=private", authorization: "Bearer private",
    },
  });
  const response = await proxyThinkingDataSdk(request, ["v1", "remote-config", "debug"], {
    ...configuration,
    relayToken: "server-side-relay-secret",
    fetchImpl: async (target, options) => {
      assert.equal(target.href, "https://sdk.example.test/v1/remote-config/debug");
      assert.equal(Buffer.from(options.body).toString(), body);
      assert.equal(options.headers.get("sign"), "request-signature");
      assert.equal(options.headers.get("device_id"), "test-browser");
      assert.equal(options.headers.get("cookie"), null);
      assert.equal(options.headers.get("authorization"), null);
      assert.equal(options.headers.get("x-monitor-relay-token"), "server-side-relay-secret");
      assert.equal(options.redirect, "error");
      return new Response('{"code":0,"data":"compressed-config"}', {
        headers: { sign: "response-signature", timestamp: "456", "content-type": "application/json", "set-cookie": "upstream=private" },
      });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("sign"), "response-signature");
  assert.equal(response.headers.get("timestamp"), "456");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-monitor-relay-token"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { code: 0, data: "compressed-config" });
});

test("SDK proxy restricts endpoints, methods and configured test app", async () => {
  let requested = false;
  const options = { ...configuration, fetchImpl: async () => { requested = true; throw new Error("Must not fetch"); } };
  assert.equal((await proxyThinkingDataSdk(new Request("https://monitor.test/admin"), ["admin"], options)).status, 404);
  assert.equal((await proxyThinkingDataSdk(new Request("https://monitor.test/debug"), ["v1", "remote-config", "debug"], options)).status, 405);
  assert.equal((await proxyThinkingDataSdk(new Request("https://monitor.test/config?appid=another-project"), ["v1", "remote-config", "config"], options)).status, 400);
  assert.equal(requested, false);
});

test("SDK proxy reports unreachable upstreams without returning internal connection details", async () => {
  const response = await proxyThinkingDataSdk(new Request("https://monitor.test/config?appid=debug-appid"), ["v1", "remote-config", "config"], {
    ...configuration, fetchImpl: async () => { throw new Error("Internal hostname, credentials, and connection details"); },
  });
  assert.equal(response.status, 502);
  const result = await response.json();
  assert.equal(result.code, -1);
  assert.match(result.error, /无法连接/);
  assert.doesNotMatch(JSON.stringify(result), /credentials/);
});
