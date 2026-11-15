import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Team Lychee | Earth Information Jukebox",
  description: "Choose an Earth map and location, then generate sound from the selected area.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
