import type { Metadata } from "next";
import "./globals.css";
import "./configurator.css";

export const metadata: Metadata = {
  title: "8K Labels — Design Your Wine Label",
  description:
    "Tell us your vision and label details — we'll generate six print-ready front label styles to choose from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* exactly what the original page's <head> loads */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hepta+Slab:wght@200;300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
