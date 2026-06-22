import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://bandeja-rivals-pass.vercel.app"),
  title: "Bandeja Rivals Pass",
  description: "Join the Bandeja Rivals community and unlock exclusive member benefits at partner venues.",
  openGraph: {
    title: "Bandeja Rivals Pass",
    description: "Join the Bandeja Rivals community and unlock exclusive member benefits at partner venues.",
    url: "https://bandeja-rivals-pass.vercel.app",
    siteName: "Bandeja Rivals Pass",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bandeja Rivals Pass",
    description: "Join the Bandeja Rivals community and unlock exclusive member benefits at partner venues.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} min-h-full bg-brand-black text-brand-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
