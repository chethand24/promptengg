import type { Metadata } from "next";
import { Header } from "@/components/header";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StepWise Tutor", template: "%s | StepWise Tutor" },
  description: "An adaptive tutor for algebra, programming, and algorithms. Work through the reasoning one step at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: 'try { const v = localStorage.getItem("stepwise-theme"); document.documentElement.dataset.theme = v || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch {}' }} />
        <a className="skip" href="#main">Skip to content</a>
        <Header />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
