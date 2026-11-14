import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earth Information Jukebox",
  description: "Listen to the visual rhythm of a NASA Earth visualization.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
