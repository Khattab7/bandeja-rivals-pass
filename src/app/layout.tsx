import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bandeja Rivals Pass",
  description: "Your official Bandeja Rivals membership pass",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-brand-black text-brand-white antialiased">
        {children}
      </body>
    </html>
  );
}
