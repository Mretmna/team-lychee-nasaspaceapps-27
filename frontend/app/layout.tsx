import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Lychee | Earth Information Jukebox",
  description: "Team Lychee's 2026 NASA Space Apps project turns Earth visualizations into an interactive sight and sound experience.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
