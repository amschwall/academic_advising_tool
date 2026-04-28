import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "W&M Academic Advising",
  description: "William & Mary Academic Advising Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
