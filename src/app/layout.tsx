import type { Metadata } from "next";
import "./globals.css";
import AmplitudeWebExperiment from "@/components/AmplitudeWebExperiment";
import { AppProvider } from "@/context/AppContext";

const criticalStyles = `
:root {
  --bg-primary: #F8F9FC;
  --bg-secondary: #FFFFFF;
  --bg-surface: rgba(0, 0, 0, 0.02);
  --bg-surface-hover: rgba(0, 0, 0, 0.05);
  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-muted: #94A3B8;
  --accent-primary: #4F46E5;
  --accent-secondary: #7C3AED;
  --accent-glow: rgba(79, 70, 229, 0.1);
  --border-subtle: rgba(0, 0, 0, 0.06);
  --border-focus: rgba(79, 70, 229, 0.4);
  --status-success: #10B981;
  --status-success-bg: rgba(16, 185, 129, 0.08);
  --status-error: #EF4444;
  --status-error-bg: rgba(239, 68, 68, 0.08);
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-full: 9999px;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}
[data-theme="dark"] {
  --bg-primary: #0A0A0B;
  --bg-secondary: #121214;
  --bg-surface: rgba(255, 255, 255, 0.03);
  --bg-surface-hover: rgba(255, 255, 255, 0.08);
  --text-primary: #EDEDED;
  --text-secondary: #A0A0A5;
  --text-muted: #66666D;
  --accent-primary: #6366F1;
  --accent-secondary: #8B5CF6;
  --accent-glow: rgba(99, 102, 241, 0.2);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(99, 102, 241, 0.5);
}
* {
  box-sizing: border-box;
}
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  line-height: 1.5;
  overflow-x: hidden;
}
a {
  color: inherit;
  text-decoration: none;
}
.glass-panel {
  background: var(--bg-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.05);
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  font: inherit;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.btn-primary {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  color: #fff;
  box-shadow: 0 2px 10px var(--accent-glow);
}
.btn-outline {
  background: transparent;
  border-color: var(--border-subtle);
  color: var(--text-primary);
}
.input-field {
  width: 100%;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-surface);
  color: var(--text-primary);
  outline: none;
  font: inherit;
}
.nav-link {
  color: var(--text-secondary);
}
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
}
.badge-success {
  background: var(--status-success-bg);
  color: var(--status-success);
  border: 1px solid rgba(16, 185, 129, 0.2);
}
.badge-error {
  background: var(--status-error-bg);
  color: var(--status-error);
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.badge-neutral {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-subtle);
}
`;

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
        <style dangerouslySetInnerHTML={{ __html: criticalStyles }} />
        <AppProvider>
          {children}
        </AppProvider>
        <AmplitudeWebExperiment />
      </body>
    </html>
  );
}
