import type { Metadata, Viewport } from "next";
// book-exporter's styles, one file per part of the app. Order matters (later
// rules win ties): base, then the shared controls, then the pages.
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/library.css";
import "./styles/book.css";

export const metadata: Metadata = {
  title: "book-exporter",
  description: "Markdown books to EPUB and PDF.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ead3" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
