import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RivalsPassCard from "@/components/RivalsPassCard";
import BandejaLogo from "@/components/BandejaLogo";

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
      className="min-h-screen bg-brand-dark flex flex-col"
      style={{ fontFamily: "Gobold, Barlow Condensed, Arial, sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <BandejaLogo width={120} height={30} />
        <form action={handleSignOut}>
          <button
            type="submit"
            className="text-white/40 text-xs tracking-widest uppercase hover:text-white/70 transition-colors"
            style={font}
          >
            SIGN OUT
          </button>
        </form>
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

            {/* Benefits panel */}
            <div
              className="border border-white/10 p-4 space-y-3"
              style={{ background: "#111" }}
            >
              <p className="text-brand-green text-[9px] tracking-[0.3em] uppercase text-center mb-4" style={font}>
                ★ EXCLUSIVE MEMBER BENEFITS ★
              </p>
              {[
                { pct: "10%", label: "OFF COURT BOOKINGS", sub: "at partner venues" },
                { pct: "10%", label: "OFF PADEL BALLS & GRIPS", sub: "at partner stores" },
                { pct: "20%", label: "OFF RIVALS MONTHLY FINALE", sub: "registration fee" },
              ].map((b) => (
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
    </div>
  );
}
