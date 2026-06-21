"use client";

import Image from "next/image";
import QRCode from "react-qr-code";
import type { Member } from "@/lib/types";

const font = {
  fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif",
};

function formatDate(dateStr: string) {
  return new Date(dateStr)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

interface Props {
  member: Member;
  validationUrl: string;
}

export default function RivalsPassCard({ member, validationUrl }: Props) {
  return (
    <div
      className="relative w-full max-w-sm mx-auto overflow-hidden select-none flex flex-col"
      style={{
        background: "linear-gradient(160deg, #0e0e0e 0%, #141414 60%, #0a0a0a 100%)",
        borderRadius: "16px",
        border: "1px solid #2a2a2a",
        boxShadow: "0 0 40px rgba(140, 247, 2, 0.08), 0 20px 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* Background court lines decoration */}
      <div className="absolute inset-0 pointer-events-none opacity-5">
        <svg viewBox="0 0 400 520" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
          <line x1="200" y1="0" x2="200" y2="520" stroke="#8CF702" strokeWidth="1"/>
          <line x1="0" y1="260" x2="400" y2="260" stroke="#8CF702" strokeWidth="1"/>
          <rect x="40" y="40" width="320" height="440" fill="none" stroke="#8CF702" strokeWidth="1"/>
          <circle cx="200" cy="260" r="60" fill="none" stroke="#8CF702" strokeWidth="1"/>
        </svg>
      </div>

      {/* Row 1: Logo + tagline */}
      <div className="relative flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center">
          <Image
            src="/bandeja-logo.png"
            alt="Bandeja"
            width={180}
            height={44}
            style={{ objectFit: "contain" }}
          />
        </div>
        <div className="text-right">
          <p className="text-white/40 text-[7px] tracking-[0.12em] leading-relaxed" style={font}>
            SWIPE . BATTLE . REPEAT.
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5" />

      {/* Row 2: RIVALS PASS heading */}
      <div className="relative px-4 py-3">
        <p
          className="text-brand-green font-bold leading-none"
          style={{ ...font, fontSize: "22px", letterSpacing: "0.05em" }}
        >
          RIVALS PASS
        </p>
        <p className="text-white/40 text-[8px] tracking-wider mt-1 italic" style={font}>
          YOU&apos;RE IN THE GAME. ENJOY THE ADVANTAGE.
        </p>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/5" />

      {/* Row 3: Member info + QR */}
      <div className="relative flex items-center justify-between gap-3 px-4 py-3">
        {/* Left: avatar + details */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar */}
          <div
            className="flex-shrink-0 rounded-full flex items-center justify-center"
            style={{ width: "48px", height: "48px", border: "2px solid #8CF702", background: "#1a1a1a" }}
          >
            {member.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-brand-green opacity-80">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="min-w-0">
            <p className="text-brand-green text-[7px] tracking-[0.2em]" style={font}>MEMBER</p>
            <p
              className="text-white font-bold leading-tight truncate"
              style={{ ...font, fontSize: "13px", letterSpacing: "0.04em" }}
            >
              {member.name.toUpperCase()}
            </p>
            <p className="text-white/40 text-[7px] tracking-wider mt-1" style={font}>MEMBER ID</p>
            <p className="text-brand-green text-[9px] tracking-wider font-bold" style={font}>
              {member.member_id.toUpperCase()}
            </p>
            <p className="text-white/40 text-[7px] tracking-wider mt-1" style={font}>VALID UNTIL</p>
            <p className="text-brand-green text-[9px] tracking-wider font-bold" style={font}>
              {formatDate(member.valid_until)}
            </p>
          </div>
        </div>

        {/* Right: QR code */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="bg-white p-1.5" style={{ width: "76px", height: "76px" }}>
            <QRCode
              value={validationUrl || "https://bandeja.app"}
              size={64}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
          <p className="text-white/50 text-[6px] tracking-[0.15em]" style={font}>SCAN TO VERIFY</p>
        </div>
      </div>

      {/* Footer bar */}
      <div
        className="relative flex items-center justify-center gap-2 py-2 mt-1"
        style={{ background: "#8CF702" }}
      >
        <span className="text-black text-[8px]">★</span>
        <p className="text-black text-[8px] tracking-[0.25em] font-bold" style={font}>
          OFFICIAL BANDEJA RIVALS MEMBER
        </p>
        <span className="text-black text-[8px]">★</span>
      </div>
    </div>
  );
}
