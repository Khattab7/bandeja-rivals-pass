import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RivalsPassCard from "@/components/RivalsPassCard";
import BandejaLogo from "@/components/BandejaLogo";
import BottomNav from "@/components/BottomNav";
import Link from "next/link";
import { PARTNER_BENEFITS } from "@/lib/pass-benefits";

const font = {
  fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif",
};

async function handleSignOut() {
  "use server";
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function PassPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Unread notification count
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', user.id)
    .eq('is_read', false)
    .eq('is_deleted_by_user', false);

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const validationUrl = member
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/validate/${member.id}`
    : "";

  return (
    <div
      className="min-h-screen bg-brand-dark flex flex-col pb-20"
      style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <div className="flex items-center gap-4">
          {/* Notification bell */}
          <Link href="/notifications" className="relative flex items-center justify-center w-8 h-8">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-brand-green text-brand-dark text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5">
                {(unreadCount ?? 0) > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <form action={handleSignOut}>
            <button
              type="submit"
              className="text-white/40 text-xs tracking-widest uppercase hover:text-white/70 transition-colors"
              style={font}
            >
              SIGN OUT
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8 gap-8">
        {!member ? (
          /* No member record found */
          <div className="text-center mt-16">
            <p className="text-brand-green text-lg tracking-widest uppercase" style={font}>
              Welcome
            </p>
            <p className="text-white/60 text-sm mt-2" style={font}>
              Your account is being set up. Please contact support.
            </p>
          </div>
        ) : !member.is_active ? (
          /* Pending activation */
          <div className="w-full max-w-sm mx-auto">
            {/* Greyed-out pass preview */}
            <div className="opacity-40 pointer-events-none">
              <RivalsPassCard member={member} validationUrl="" />
            </div>
            <div className="mt-6 text-center">
              <div
                className="inline-block border border-brand-green/40 px-4 py-2"
              >
                <p className="text-brand-green text-xs tracking-widest uppercase" style={font}>
                  MEMBERSHIP PENDING
                </p>
              </div>
              <p className="text-white/50 text-xs mt-3 leading-relaxed" style={font}>
                Your Rivals Pass is pending activation.{"\n"}You will be notified once it&apos;s ready.
              </p>
            </div>
          </div>
        ) : (
          /* Active pass */
          <div className="w-full max-w-sm mx-auto flex flex-col gap-6">
            <RivalsPassCard member={member} validationUrl={validationUrl} />

            {/* Apple Wallet */}
            <a
              href="/api/wallet/apple"
              className="flex items-center justify-center gap-3 border border-white/20 py-3 hover:border-white/40 transition-colors"
              style={{ background: "#111" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="text-white text-sm tracking-widest uppercase" style={font}>
                Add to Apple Wallet
              </span>
            </a>

            {/* Benefits panel */}
            <div
              className="border border-white/10 p-4 space-y-3"
              style={{ background: "#111" }}
            >
              <p className="text-brand-green text-[9px] tracking-[0.3em] uppercase text-center mb-4" style={font}>
                ★ EXCLUSIVE MEMBER BENEFITS ★
              </p>
              {PARTNER_BENEFITS.map((b) => (
                <div key={b.label} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-8 h-8 rounded-full border border-brand-green/60 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-green text-[8px]" style={font}>%</span>
                  </div>
                  <div>
                    <p className="text-white text-xs leading-tight" style={font}>
                      <span className="text-brand-green font-bold">{b.pct} </span>
                      {b.label}
                    </p>
                    <p className="text-white/40 text-[9px]" style={font}>{b.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-white/20 text-[9px] text-center tracking-wider" style={font}>
              MORE MATCHES. MORE REWARDS. MORE RIVALS.
            </p>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
