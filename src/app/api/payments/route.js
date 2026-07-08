import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = authStore.verifySessionToken(token);

  if (!session) {
    return null;
  }

  return authStore.ensureUserForSession(session.userId);
}

export async function POST(request) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const payment = await authStore.createPayment({
      userId: user.id,
      amount: body?.amount,
      currency: body?.currency,
      paymentMethod: body?.paymentMethod,
      source: body?.source,
      amountEntryMethod: body?.amountEntryMethod,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to store payment" },
      { status: 400 }
    );
  }
}
