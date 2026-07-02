import { createClient } from "@/lib/supabase/server";
import BandejaLogo from "@/components/BandejaLogo";

const font = {
  fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif",
};

function formatDate(dateStr: string) {
  return new Date(dateStr)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("name, member_id, is_active, valid_until, avatar_url")
    .eq("user_id", id)
    .single();

  const isExpired = member
    ? new Date(member.valid_until) < new Date()
    : false;

  const isValid = member && member.is_active && !isExpired;

  return (
    <div
      className="min-h-screen bg-brand-dark flex flex-col items-center justify-center px-4"
      style={font}
    >
      {/* Header */}
      <div className="flex flex-col items-center mb-8 gap-1">
        <BandejaLogo width={160} height={40} />
        <p className="text-white/50 text-[9px] tracking-widest uppercase" style={font}>RIVALS PASS</p>
      </div>

      {!member ? (
        /* Not found */
        <div className="text-center max-w-xs">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "#1a0a0a", border: "2px solid #ef4444" }}
          >
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#ef4444">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm5 13.6L15.6 17 12 13.4 8.4 17 7 15.6l3.6-3.6L7 8.4 8.4 7l3.6 3.6L15.6 7 17 8.4 13.4 12l3.6 3.6z"/>
            </svg>
          </div>
          <p className="text-red-400 text-lg tracking-widest uppercase" style={font}>
            INVALID PASS
          </p>
          <p className="text-white/40 text-xs mt-2 tracking-wider" style={font}>
            This pass does not exist in our system.
          </p>
        </div>
      ) : isValid ? (
        /* Valid */
        <div className="text-center max-w-xs w-full">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "#0a1a0a", border: "2px solid #8CF702" }}
          >
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#8CF702">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 14.5l-3.5-3.5 1.4-1.4 2.1 2.1 5.6-5.6 1.4 1.4-7 7z"/>
            </svg>
          </div>

          <p className="text-brand-green text-xl tracking-widest uppercase mb-1" style={font}>
            VALID MEMBER
          </p>

          <div
            className="border border-white/10 mt-6 p-5 text-left space-y-4"
            style={{ background: "#111" }}
          >
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ border: "2px solid #8CF702", background: "#1a1a1a" }}
              >
                {member.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatar_url} alt={member.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-7 h-7 fill-brand-green opacity-80">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="text-brand-green text-[8px] tracking-widest uppercase" style={font}>MEMBER</p>
                <p className="text-white font-bold tracking-wide" style={{ ...font, fontSize: "15px" }}>
                  {member.name.toUpperCase()}
                </p>
                <p className="text-white/40 text-[8px] tracking-wider mt-0.5" style={font}>
                  {member.member_id.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/40 text-[8px] tracking-widest uppercase" style={font}>VALID UNTIL</p>
              <p className="text-brand-green text-sm font-bold tracking-wider mt-0.5" style={font}>
                {formatDate(member.valid_until)}
              </p>
            </div>

            <div
              className="border border-brand-green/20 p-3"
              style={{ background: "#0d1a0a" }}
            >
              <p className="text-brand-green text-[9px] tracking-widest uppercase text-center" style={font}>
                APPLY MEMBER DISCOUNT
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Inactive or expired */
        <div className="text-center max-w-xs">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "#1a0e0a", border: "2px solid #f97316" }}
          >
            <svg viewBox="0 0 24 24" className="w-10 h-10" fill="#f97316">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <p className="text-orange-400 text-lg tracking-widest uppercase" style={font}>
            {isExpired ? "PASS EXPIRED" : "MEMBERSHIP INACTIVE"}
          </p>
          <p className="text-white/40 text-xs mt-2 tracking-wider" style={font}>
            {member.name.toUpperCase()}
          </p>
          <p className="text-white/30 text-[9px] mt-1 tracking-wider" style={font}>
            {isExpired
              ? `Expired: ${formatDate(member.valid_until)}`
              : "This membership has not been activated."}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 text-center">
        <p className="text-white/20 text-[9px] tracking-widest uppercase" style={font}>
          BANDEJA.APP/RIVALS-PASS
        </p>
      </div>
    </div>
  );
}
