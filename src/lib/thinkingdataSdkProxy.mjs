const allowedPaths = new Map([
  ["v1/remote-config/config", "GET"],
  ["v1/remote-config/get", "POST"],
  ["v1/remote-config/debug", "POST"],
  ["sync_js", "POST"],
  ["data_debug", "POST"],
]);
const forwardedHeaders = ["content-type", "appid", "device_id", "template_code", "timestamp", "sign"];

function failure(error, status) {
  return Response.json({ code: -1, msg: error, error }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

export async function proxyThinkingDataSdk(request, path, options = {}) {
  const endpoint = path.join("/");
  if (!allowedPaths.has(endpoint)) return failure("SDK 接口不存在", 404);
  if (request.method !== allowedPaths.get(endpoint)) return failure("请求方法不支持", 405);

  const upstreamUrl = options.upstreamUrl ?? process.env.THINKINGDATA_TEST_SERVER_URL;
  const appId = options.appId ?? process.env.THINKINGDATA_TEST_APP_ID;
  if (!upstreamUrl || !appId) return failure("测试环境的 App ID 或 SDK 接收地址未配置", 503);
  const incomingUrl = new URL(request.url);
  const requestedAppId = request.headers.get("appid") || incomingUrl.searchParams.get("appid");
  if (requestedAppId && requestedAppId !== appId) return failure("测试 App ID 不匹配", 400);

  let target;
  try {
    const base = new URL(upstreamUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      return failure("SDK 接收地址配置无效", 503);
    }
    target = new URL(`${base.href.replace(/\/$/, "")}/${endpoint}`);
    target.search = incomingUrl.search;
  } catch {
    return failure("SDK 接收地址配置无效", 503);
  }

  const body = request.method === "GET" ? undefined : await request.arrayBuffer();
  if (body && body.byteLength > 1024 * 1024) return failure("SDK 请求体过大", 413);
  const headers = new Headers();
  for (const key of forwardedHeaders) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const relayToken = options.relayToken ?? process.env.THINKINGDATA_TEST_RELAY_TOKEN;
  if (relayToken) headers.set("x-monitor-relay-token", relayToken);
  try {
    const response = await (options.fetchImpl || fetch)(target, {
      method: request.method, headers, body, redirect: "error", cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const key of ["content-type", "timestamp", "sign"]) {
      const value = response.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return failure("无法连接测试环境的 SDK 接收服务；线上部署需要能从 Vercel 访问的接收地址。", 502);
  }
}
