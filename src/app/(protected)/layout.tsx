import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import { authStore } from "@/lib/authStore.mjs";
import { SESSION_COOKIE_NAME } from "@/lib/authCookies.mjs";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = authStore.verifySessionToken(token);

  if (!session || !(await authStore.getUserById(session.userId))) {
    redirect("/login");
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopNav />
        <main style={{ flex: 1, overflowY: "auto", padding: "2rem" }}>{children}</main>
      </div>
    </div>
  );
}
