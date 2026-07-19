import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/PWARegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: "#8CF702",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bandeja-rivals-pass.vercel.app"),
  title: "BANDEJA Rivals",
  description: "Padel matchmaking — find rivals, form teams, climb the leaderboard.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BANDEJA",
  },
  openGraph: {
    title: "BANDEJA Rivals",
    description: "Padel matchmaking — find rivals, form teams, climb the leaderboard.",
    url: "https://bandeja-rivals-pass.vercel.app",
    siteName: "BANDEJA Rivals",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BANDEJA Rivals",
    description: "Padel matchmaking — find rivals, form teams, climb the leaderboard.",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BANDEJA" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${inter.variable} min-h-full bg-brand-black text-brand-white antialiased`}>
        {/* Splash — raw HTML so it appears before any JS loads */}
        <div id="splash-screen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bandeja-logo.png" alt="BANDEJA" width={180} height={44} style={{ objectFit: 'contain' }} />
          <p id="splash-tag">Swipe · Battle · Repeat</p>
          <div id="splash-dot" />
        </div>
        {/* Runs synchronously — hides splash before first paint if already shown this session */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var e=document.getElementById('splash-screen');if(!e)return;var pwa=window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone===true;if(!pwa||window.location.pathname.startsWith('/admin')){e.style.display='none';return;}if(sessionStorage.getItem('s')){e.style.display='none';return;}sessionStorage.setItem('s','1');setTimeout(function(){e.style.opacity='0';setTimeout(function(){e.style.display='none';},500);},1600);}())` }} />
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
