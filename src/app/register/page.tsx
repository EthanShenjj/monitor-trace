import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";
import { authStore } from "@/lib/authStore.mjs";

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const session = authStore.verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (session && (await authStore.getUserById(session.userId))) {
    redirect("/");
  }

  return <AuthForm mode="register" />;
}
