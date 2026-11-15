import type { Metadata } from "next";
import "./globals.css";
import { SiteHelp } from "@/components/site-help";

export const metadata: Metadata = {
  title: "Lychee Juicebox",
  description: "Choose an Earth map and location, then generate sound from the selected area.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to main content</a><a className="skip-link accessibility-skip" href="#site-help-controls">Skip to accessibility controls</a>{children}<SiteHelp /></body>
    </html>
  );
}
