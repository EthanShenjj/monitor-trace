import type { Metadata } from "next";
import "./globals.css";
import AmplitudeWebExperiment from "@/components/AmplitudeWebExperiment";
import { AppProvider } from "@/context/AppContext";

export const metadata: Metadata = {
  title: "AI Trace Monitor",
  description: "Advanced Observability & Tracing for AI Agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProvider>
          {children}
        </AppProvider>
        <AmplitudeWebExperiment />
      </body>
    </html>
  );
}
