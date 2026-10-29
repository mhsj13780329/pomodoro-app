import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { strings } from "@/features/timer/strings.fa";

// Self-hosted so the app does not call Google Fonts, which may be unreachable in Iran.
export const metadata: Metadata = {
  title: strings.appName,
  description: strings.appDescription,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="min-h-full bg-ground font-sans text-ink">{children}</body>
    </html>
  );
}
