import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const alt = "Bandeja Rivals Pass";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), "public/bandeja-logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#0d0d0d",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Diagonal decorative lines — bottom left */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          display: "flex",
        }}>
          <svg width="1200" height="630" style={{ position: "absolute" }}>
            <line x1="0" y1="630" x2="420" y2="0" stroke="#8CF702" strokeWidth="3" opacity="0.3"/>
            <line x1="0" y1="500" x2="336" y2="0" stroke="white" strokeWidth="1.5" opacity="0.1"/>
            <line x1="1200" y1="0" x2="780" y2="630" stroke="#8CF702" strokeWidth="3" opacity="0.3"/>
            <line x1="1200" y1="130" x2="864" y2="630" stroke="white" strokeWidth="1.5" opacity="0.1"/>
          </svg>
        </div>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={360} height={88} style={{ objectFit: "contain" }} alt="Bandeja" />

        {/* RIVALS PASS */}
        <div style={{
          color: "#8CF702",
          fontSize: 80,
          fontWeight: 900,
          letterSpacing: 16,
          marginTop: 32,
          fontFamily: "Arial Black, Arial, sans-serif",
        }}>
          RIVALS PASS
        </div>

        {/* Tagline */}
        <div style={{
          color: "rgba(255,255,255,0.4)",
          fontSize: 24,
          letterSpacing: 10,
          marginTop: 16,
          fontFamily: "Arial, sans-serif",
        }}>
          SWIPE . BATTLE . REPEAT.
        </div>

        {/* Green footer bar */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          background: "#8CF702",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            color: "#0d0d0d",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 6,
            fontFamily: "Arial, sans-serif",
          }}>
            ★ OFFICIAL BANDEJA RIVALS MEMBER ★
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
