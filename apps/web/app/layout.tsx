import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ag-ui — Company AI",
  description: "Multimodal Company Intelligence & Generative UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen bg-zinc-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
