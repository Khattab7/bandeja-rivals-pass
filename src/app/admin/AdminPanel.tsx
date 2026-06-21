"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Member, ApprovedPhone } from "@/lib/types";
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

export default function AdminPanel({
  members: initial,
  approvedPhones: initialPhones,
}: {
  members: Member[];
  approvedPhones: ApprovedPhone[];
}) {
  const supabase = createClient();
  const [members, setMembers] = useState<Member[]>(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");

  // Approved phones state
  const [approvedPhones, setApprovedPhones] = useState<ApprovedPhone[]>(initialPhones);
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneName, setNewPhoneName] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "phones">("members");

  async function toggleActive(member: Member) {
    setLoading(member.id);
    setActionError(null);
    const newActive = !member.is_active;

    // Generate member_id when activating for the first time
    let memberId = member.member_id;
    if (newActive && (!memberId || memberId === "PENDING")) {
      const count = members.filter((m) => m.member_id && m.member_id !== "PENDING").length + 1;
      const year = new Date().getFullYear().toString().slice(-2);
      memberId = `BRP-${year}-${String(count).padStart(6, "0")}`;
    }

    const { data, error } = await supabase
      .from("members")
      .update({ is_active: newActive, member_id: memberId })
      .eq("id", member.id)
      .select();

    if (error) {
      setActionError(`Update failed: ${error.message} (code: ${error.code})`);
    } else if (data && data.length > 0) {
      setMembers((prev) => prev.map((m) => (m.id === member.id ? data[0] : m)));
    } else {
      setActionError("Update blocked — check your admin role is set and you re-logged in after setting it.");
    }
    setLoading(null);
  }

  async function saveValidUntil(memberId: string) {
    if (!editDate) return;
    setLoading(memberId);

    const { data, error } = await supabase
      .from("members")
      .update({ valid_until: editDate })
      .eq("id", memberId)
      .select()
      .single();

    if (!error && data) {
      setMembers((prev) => prev.map((m) => (m.id === memberId ? data : m)));
    }
    setEditId(null);
    setLoading(null);
  }

  async function addApprovedPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setPhoneLoading(true);
    setPhoneError(null);

    const { data, error } = await supabase
      .from("approved_phones")
      .insert({ phone: newPhone.trim(), name: newPhoneName.trim() || null })
      .select()
      .single();

    if (error) {
      setPhoneError(error.message.includes("unique") ? "This phone number is already in the list." : error.message);
    } else if (data) {
      setApprovedPhones((prev) => [data as ApprovedPhone, ...prev]);
      setNewPhone("");
      setNewPhoneName("");
    }
    setPhoneLoading(false);
  }

  async function removeApprovedPhone(id: string) {
    setPhoneLoading(true);
    const { error } = await supabase.from("approved_phones").delete().eq("id", id);
    if (!error) {
      setApprovedPhones((prev) => prev.filter((p) => p.id !== id));
    }
    setPhoneLoading(false);
  }

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.member_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-brand-dark" style={font}>
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <BandejaLogo width={120} height={30} />
            <p className="text-brand-green text-[9px] tracking-widest uppercase mt-0.5" style={font}>ADMIN PANEL</p>
          </div>
        </div>
        <div className="text-white/30 text-xs tracking-wider" style={font}>
          {members.length} MEMBERS
        </div>
      </header>

      <main className="px-4 py-6 max-w-5xl mx-auto">
        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-6">
          {(["members", "phones"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-2.5 text-[10px] tracking-widest uppercase transition-colors"
              style={{
                ...font,
                color: activeTab === tab ? "#8CF702" : "rgba(255,255,255,0.3)",
                borderBottom: activeTab === tab ? "2px solid #8CF702" : "2px solid transparent",
              }}
            >
              {tab === "members" ? "MEMBERS" : "PRE-APPROVED PHONES"}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="border border-red-500/40 bg-red-500/10 text-red-400 text-xs px-4 py-3 mb-4" style={font}>
            {actionError}
          </div>
        )}

        {activeTab === "phones" ? (
          <div className="max-w-lg">
            <p className="text-white/40 text-[10px] tracking-wider mb-4" style={font}>
              Players who sign up with a pre-approved phone number will have their pass activated automatically.
            </p>

            {/* Add phone form */}
            <form onSubmit={addApprovedPhone} className="flex flex-col gap-2 mb-6">
              <input
                type="tel"
                placeholder="Phone number (e.g. +971501234567)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                required
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors"
                style={font}
              />
              <input
                type="text"
                placeholder="Label / name (optional)"
                value={newPhoneName}
                onChange={(e) => setNewPhoneName(e.target.value)}
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors"
                style={font}
              />
              {phoneError && (
                <p className="text-red-400 text-xs" style={font}>{phoneError}</p>
              )}
              <button
                type="submit"
                disabled={phoneLoading || !newPhone.trim()}
                className="w-full border border-brand-green text-brand-green py-2.5 text-[10px] tracking-widest uppercase disabled:opacity-40 hover:bg-brand-green/10 transition-colors"
                style={font}
              >
                {phoneLoading ? "..." : "ADD PHONE"}
              </button>
            </form>

            {/* Approved phones list */}
            <div className="space-y-2">
              {approvedPhones.length === 0 && (
                <p className="text-white/20 text-center py-8 text-xs tracking-wider" style={font}>
                  NO PRE-APPROVED PHONES YET
                </p>
              )}
              {approvedPhones.map((p) => (
                <div
                  key={p.id}
                  className="border border-white/10 px-4 py-3 flex items-center justify-between"
                  style={{ background: "#111" }}
                >
                  <div>
                    <p className="text-white text-sm font-bold" style={font}>{p.phone}</p>
                    {p.name && (
                      <p className="text-white/40 text-[9px] mt-0.5" style={font}>{p.name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeApprovedPhone(p.id)}
                    disabled={phoneLoading}
                    className="text-red-400/60 text-[9px] tracking-widest hover:text-red-400 transition-colors disabled:opacity-40"
                    style={font}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, email or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors mb-6"
          style={font}
        />

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "TOTAL", value: members.length },
            { label: "ACTIVE", value: members.filter((m) => m.is_active).length, color: "#8CF702" },
            { label: "PENDING", value: members.filter((m) => !m.is_active).length, color: "#f97316" },
          ].map((s) => (
            <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: "#111" }}>
              <p className="text-white/40 text-[8px] tracking-widest uppercase" style={font}>{s.label}</p>
              <p className="text-2xl font-bold mt-1" style={{ ...font, color: s.color ?? "#fff" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Members list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-white/30 text-center py-8 text-sm tracking-wider" style={font}>
              NO MEMBERS FOUND
            </p>
          )}

          {filtered.map((member) => (
            <div
              key={member.id}
              className="border border-white/10 p-4"
              style={{ background: "#111" }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Member info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: `2px solid ${member.is_active ? "#8CF702" : "#444"}`,
                      background: "#1a1a1a",
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill={member.is_active ? "#8CF702" : "#444"}>
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-bold truncate" style={font}>
                      {member.name.toUpperCase()}
                    </p>
                    <p className="text-white/40 text-[9px] truncate" style={font}>{member.email}</p>
                    {member.phone && (
                      <p className="text-white/30 text-[9px]" style={font}>{member.phone}</p>
                    )}
                    <p className="text-brand-green text-[9px] font-bold mt-0.5" style={font}>
                      {member.member_id === "PENDING" ? "—" : member.member_id.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* Right: status + actions */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {/* Status badge */}
                  <span
                    className="text-[8px] tracking-widest px-2 py-0.5"
                    style={{
                      ...font,
                      background: member.is_active ? "rgba(140,247,2,0.1)" : "rgba(249,115,22,0.1)",
                      color: member.is_active ? "#8CF702" : "#f97316",
                      border: `1px solid ${member.is_active ? "#8CF702" : "#f97316"}`,
                    }}
                  >
                    {member.is_active ? "ACTIVE" : "PENDING"}
                  </span>

                  {/* Valid until */}
                  <div className="text-right">
                    {editId === member.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="bg-transparent border border-white/20 text-white text-[9px] px-2 py-1 outline-none"
                          style={font}
                        />
                        <button
                          onClick={() => saveValidUntil(member.id)}
                          disabled={loading === member.id}
                          className="text-brand-green text-[9px] tracking-wider hover:underline disabled:opacity-50"
                          style={font}
                        >
                          SAVE
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="text-white/30 text-[9px] hover:text-white/60"
                          style={font}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditId(member.id);
                          setEditDate(member.valid_until.split("T")[0]);
                        }}
                        className="text-white/40 text-[9px] tracking-wider hover:text-white/70 text-right"
                        style={font}
                      >
                        <span className="text-white/20 text-[7px] block">VALID UNTIL</span>
                        {formatDate(member.valid_until)}
                      </button>
                    )}
                  </div>

                  {/* Activate / Deactivate */}
                  <button
                    onClick={() => toggleActive(member)}
                    disabled={loading === member.id}
                    className="text-[9px] tracking-widest px-3 py-1.5 border transition-colors disabled:opacity-50"
                    style={{
                      ...font,
                      borderColor: member.is_active ? "#444" : "#8CF702",
                      color: member.is_active ? "#888" : "#8CF702",
                    }}
                  >
                    {loading === member.id
                      ? "..."
                      : member.is_active
                      ? "DEACTIVATE"
                      : "ACTIVATE"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
          </>
        )}
      </main>
    </div>
  );
}
