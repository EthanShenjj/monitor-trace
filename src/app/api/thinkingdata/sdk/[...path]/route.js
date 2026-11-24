import { proxyThinkingDataSdk } from "@/lib/thinkingdataSdkProxy.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request, { params }) {
  const { path } = await params;
  return proxyThinkingDataSdk(request, path);
}

export { handle as GET, handle as POST };
