import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = authStore.verifySessionToken(token);

  if (!session) {
    return null;
  }

  return authStore.getUserById(session.userId);
}

export async function PATCH(_request, { params }) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const message = await authStore.markWebhookMessageRead(id);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to update message" },
      { status: 404 }
    );
  }
}
