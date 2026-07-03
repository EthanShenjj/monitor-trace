import { NextResponse } from "next/server";
import { authStore } from "@/lib/authStore.mjs";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/authCookies.mjs";

export async function POST(request) {
  try {
    const body = await request.json();
    const user = await authStore.registerUser({
      name: body?.name,
      email: body?.email,
      password: body?.password,
    });
    const token = authStore.createSessionToken(user.id);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to register" },
      { status: 400 }
    );
  }
}
