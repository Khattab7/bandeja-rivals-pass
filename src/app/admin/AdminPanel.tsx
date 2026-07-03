"use client";

import { useState, useTransition, useEffect } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Member, ApprovedPhone } from "@/lib/types";
import BandejaLogo from "@/components/BandejaLogo";
import Link from "next/link";
import {
  adminGetPlayers, adminSuspendPlayer, adminBanPlayer, adminSetPlayerRating,
  adminGetMatches, adminVoidMatch,
  adminGetSettings, adminUpdateSetting,
  adminGetBarsLedger, adminAdjustBars,
  adminGetQuestTemplates, adminCreateQuestTemplate, adminApproveQuestTemplate,
  adminGetQuestInstances, adminCreateQuestInstance, adminEndQuestInstance,
  adminPreviewGlobalAdjustment, adminApplyGlobalAdjustment,
} from "@/app/actions/admin";

const G = { fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif" };
const I = { fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

type AdminTab = "members" | "phones" | "players" | "matches" | "settings" | "bars" | "quests";

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
  const [approvedPhones, setApprovedPhones] = useState<ApprovedPhone[]>(initialPhones);
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneName, setNewPhoneName] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("members");
  const [csvResult, setCsvResult] = useState<{ added: number; skipped: number } | null>(null);

  const TABS: { key: AdminTab; label: string }[] = [
    { key: "members", label: "Members" },
    { key: "phones", label: "Phones" },
    { key: "players", label: "Players" },
    { key: "matches", label: "Matches" },
    { key: "settings", label: "Settings" },
    { key: "bars", label: "Bars" },
    { key: "quests", label: "Quests" },
  ];

  async function toggleActive(member: Member) {
    setLoading(member.id); setActionError(null);
    const newActive = !member.is_active;
    let memberId = member.member_id;
    if (newActive && (!memberId || memberId === "PENDING")) {
      const count = members.filter((m) => m.member_id && m.member_id !== "PENDING").length + 1;
      const year = new Date().getFullYear().toString().slice(-2);
      memberId = `BRP-${year}-${String(count).padStart(6, "0")}`;
    }
    const { data, error } = await supabase.from("members").update({ is_active: newActive, member_id: memberId }).eq("id", member.id).select();
    if (error) setActionError(`Update failed: ${error.message}`);
    else if (data?.[0]) setMembers((prev) => prev.map((m) => (m.id === member.id ? data[0] : m)));
    else setActionError("Update blocked — check admin role.");
    setLoading(null);
  }

  async function saveValidUntil(memberId: string) {
    if (!editDate) return; setLoading(memberId);
    const { data, error } = await supabase.from("members").update({ valid_until: editDate }).eq("id", memberId).select().single();
    if (!error && data) setMembers((prev) => prev.map((m) => (m.id === memberId ? data : m)));
    setEditId(null); setLoading(null);
  }

  async function addApprovedPhone(e: React.FormEvent) {
    e.preventDefault(); if (!newPhone.trim()) return;
    setPhoneLoading(true); setPhoneError(null);
    const { data, error } = await supabase.from("approved_phones").insert({ phone: newPhone.trim(), name: newPhoneName.trim() || null }).select().single();
    if (error) setPhoneError(error.message.includes("unique") ? "Already in list." : error.message);
    else if (data) { setApprovedPhones((p) => [data as ApprovedPhone, ...p]); setNewPhone(""); setNewPhoneName(""); }
    setPhoneLoading(false);
  }

  async function removeApprovedPhone(id: string) {
    setPhoneLoading(true);
    const { error } = await supabase.from("approved_phones").delete().eq("id", id);
    if (!error) setApprovedPhones((p) => p.filter((x) => x.id !== id));
    setPhoneLoading(false);
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setCsvResult(null); setPhoneError(null); setPhoneLoading(true);
    let records: { phone: string; name: string | null }[] = [];
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      records = rows.map((r) => ({ phone: String(r[0] ?? "").trim(), name: r[1] ? String(r[1]).trim() : null })).filter((r) => r.phone);
    } else {
      const text = await file.text();
      records = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
        .map((l) => { const [p, n] = l.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")); return { phone: p, name: n || null }; }).filter((r) => r.phone);
    }
    if (!records.length) { setPhoneError("No valid phone numbers found."); setPhoneLoading(false); e.target.value = ""; return; }
    const { data, error } = await supabase.from("approved_phones").upsert(records, { onConflict: "phone", ignoreDuplicates: true }).select();
    if (error) setPhoneError(`Import failed: ${error.message}`);
    else { const added = data?.length ?? 0; setCsvResult({ added, skipped: records.length - added }); if (data?.length) { const newE = data as ApprovedPhone[]; setApprovedPhones((p) => { const ids = new Set(p.map((x) => x.id)); return [...newE.filter((x) => !ids.has(x.id)), ...p]; }); } }
    setPhoneLoading(false); e.target.value = "";
  }

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.member_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-brand-dark" style={G}>
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col">
          <BandejaLogo width={120} height={30} />
          <p className="text-brand-green text-[9px] tracking-widest uppercase mt-0.5" style={G}>ADMIN PANEL</p>
        </div>
        <div className="text-white/30 text-xs tracking-wider">{members.length} MEMBERS</div>
      </header>

      <main className="px-4 py-6 max-w-5xl mx-auto">
        {/* Tabs */}
        <div className="flex border-b border-white/10 mb-6 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className="px-4 py-2.5 text-[10px] tracking-widest uppercase transition-colors shrink-0"
              style={{ ...G, color: activeTab === key ? "#8CF702" : "rgba(255,255,255,0.3)", borderBottom: activeTab === key ? "2px solid #8CF702" : "2px solid transparent" }}>
              {label}
            </button>
          ))}
        </div>

        {actionError && <div className="border border-red-500/40 bg-red-500/10 text-red-400 text-xs px-4 py-3 mb-4">{actionError}</div>}

        {activeTab === "members" && (
          <MembersTab members={members} filtered={filtered} loading={loading} editId={editId} editDate={editDate}
            search={search} setSearch={setSearch} setEditId={setEditId} setEditDate={setEditDate}
            toggleActive={toggleActive} saveValidUntil={saveValidUntil} />
        )}
        {activeTab === "phones" && (
          <PhonesTab approvedPhones={approvedPhones} newPhone={newPhone} newPhoneName={newPhoneName}
            phoneLoading={phoneLoading} phoneError={phoneError} csvResult={csvResult}
            setNewPhone={setNewPhone} setNewPhoneName={setNewPhoneName}
            addApprovedPhone={addApprovedPhone} removeApprovedPhone={removeApprovedPhone} handleCsvImport={handleCsvImport} />
        )}
        {activeTab === "players" && <PlayersTab />}
        {activeTab === "matches" && <MatchesTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "bars" && <BarsTab />}
        {activeTab === "quests" && <QuestsTab />}
      </main>
    </div>
  );
}

// ── Members Tab ──────────────────────────────────────────────

function MembersTab({ members, filtered, loading, editId, editDate, search, setSearch, setEditId, setEditDate, toggleActive, saveValidUntil }: {
  members: Member[]; filtered: Member[]; loading: string | null; editId: string | null; editDate: string; search: string;
  setSearch: (v: string) => void; setEditId: (v: string | null) => void; setEditDate: (v: string) => void;
  toggleActive: (m: Member) => void; saveValidUntil: (id: string) => void;
}) {
  return (
    <>
      <input type="text" placeholder="Search by name, email or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors mb-6" style={G} />
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[{ label: "TOTAL", value: members.length }, { label: "ACTIVE", value: members.filter((m) => m.is_active).length, color: "#8CF702" }, { label: "PENDING", value: members.filter((m) => !m.is_active).length, color: "#f97316" }].map((s) => (
          <div key={s.label} className="border border-white/10 p-3 text-center" style={{ background: "#111" }}>
            <p className="text-white/40 text-[8px] tracking-widest uppercase">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color ?? "#fff" }}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-white/30 text-center py-8 text-sm tracking-wider">NO MEMBERS FOUND</p>}
        {filtered.map((member) => (
          <div key={member.id} className="border border-white/10 p-4" style={{ background: "#111" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${member.is_active ? "#8CF702" : "#444"}`, background: "#1a1a1a" }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill={member.is_active ? "#8CF702" : "#444"}><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold truncate">{member.name.toUpperCase()}</p>
                  <p className="text-white/40 text-[9px] truncate">{member.email}</p>
                  {member.phone && <p className="text-white/30 text-[9px]">{member.phone}</p>}
                  <p className="text-brand-green text-[9px] font-bold mt-0.5">{member.member_id === "PENDING" ? "—" : member.member_id.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="text-[8px] tracking-widest px-2 py-0.5" style={{ background: member.is_active ? "rgba(140,247,2,0.1)" : "rgba(249,115,22,0.1)", color: member.is_active ? "#8CF702" : "#f97316", border: `1px solid ${member.is_active ? "#8CF702" : "#f97316"}` }}>
                  {member.is_active ? "ACTIVE" : "PENDING"}
                </span>
                <div className="text-right">
                  {editId === member.id ? (
                    <div className="flex items-center gap-1">
                      <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="bg-transparent border border-white/20 text-white text-[9px] px-2 py-1 outline-none" style={G} />
                      <button onClick={() => saveValidUntil(member.id)} className="text-brand-green text-[9px] tracking-wider hover:underline">SAVE</button>
                      <button onClick={() => setEditId(null)} className="text-white/30 text-[9px] hover:text-white/60">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditId(member.id); setEditDate(member.valid_until.split("T")[0]); }} className="text-white/40 text-[9px] tracking-wider hover:text-white/70 text-right">
                      <span className="text-white/20 text-[7px] block">VALID UNTIL</span>
                      {formatDate(member.valid_until)}
                    </button>
                  )}
                </div>
                <button onClick={() => toggleActive(member)} disabled={loading === member.id}
                  className="text-[9px] tracking-widest px-3 py-1.5 border transition-colors disabled:opacity-50"
                  style={{ borderColor: member.is_active ? "#444" : "#8CF702", color: member.is_active ? "#888" : "#8CF702" }}>
                  {loading === member.id ? "..." : member.is_active ? "DEACTIVATE" : "ACTIVATE"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Phones Tab ───────────────────────────────────────────────

function PhonesTab({ approvedPhones, newPhone, newPhoneName, phoneLoading, phoneError, csvResult, setNewPhone, setNewPhoneName, addApprovedPhone, removeApprovedPhone, handleCsvImport }: {
  approvedPhones: ApprovedPhone[]; newPhone: string; newPhoneName: string; phoneLoading: boolean; phoneError: string | null; csvResult: { added: number; skipped: number } | null;
  setNewPhone: (v: string) => void; setNewPhoneName: (v: string) => void;
  addApprovedPhone: (e: React.FormEvent) => void; removeApprovedPhone: (id: string) => void; handleCsvImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="max-w-lg">
      <p className="text-white/40 text-[10px] tracking-wider mb-4">Players who sign up with a pre-approved phone number will have their pass activated automatically.</p>
      <form onSubmit={addApprovedPhone} className="flex flex-col gap-2 mb-6">
        <input type="tel" placeholder="Phone (e.g. +971501234567)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} required className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={G} />
        <input type="text" placeholder="Label / name (optional)" value={newPhoneName} onChange={(e) => setNewPhoneName(e.target.value)} className="w-full bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={G} />
        {phoneError && <p className="text-red-400 text-xs">{phoneError}</p>}
        <button type="submit" disabled={phoneLoading || !newPhone.trim()} className="w-full border border-brand-green text-brand-green py-2.5 text-[10px] tracking-widest uppercase disabled:opacity-40 hover:bg-brand-green/10 transition-colors" style={G}>{phoneLoading ? "..." : "ADD PHONE"}</button>
      </form>
      <div className="border border-white/10 p-4 mb-6" style={{ background: "#0d0d0d" }}>
        <p className="text-white/50 text-[9px] tracking-widest uppercase mb-3">BULK IMPORT FROM CSV</p>
        <label className="flex items-center justify-center gap-2 border border-dashed border-white/20 px-4 py-3 cursor-pointer hover:border-brand-green/50 transition-colors" style={{ opacity: phoneLoading ? 0.5 : 1 }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white/40"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
          <span className="text-white/40 text-[10px] tracking-widest uppercase">{phoneLoading ? "IMPORTING..." : "CHOOSE CSV OR EXCEL FILE"}</span>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={handleCsvImport} disabled={phoneLoading} className="sr-only" />
        </label>
        {csvResult && <div className="mt-3 flex gap-4"><span className="text-brand-green text-[9px] tracking-wider">✓ {csvResult.added} ADDED</span>{csvResult.skipped > 0 && <span className="text-white/30 text-[9px] tracking-wider">{csvResult.skipped} ALREADY EXISTED</span>}</div>}
      </div>
      <div className="space-y-2">
        {approvedPhones.length === 0 && <p className="text-white/20 text-center py-8 text-xs tracking-wider">NO PRE-APPROVED PHONES YET</p>}
        {approvedPhones.map((p) => (
          <div key={p.id} className="border border-white/10 px-4 py-3 flex items-center justify-between" style={{ background: "#111" }}>
            <div><p className="text-white text-sm font-bold">{p.phone}</p>{p.name && <p className="text-white/40 text-[9px] mt-0.5">{p.name}</p>}</div>
            <button onClick={() => removeApprovedPhone(p.id)} disabled={phoneLoading} className="text-red-400/60 text-[9px] tracking-widest hover:text-red-400 transition-colors disabled:opacity-40">REMOVE</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Players Tab ──────────────────────────────────────────────

type PlayerRow = { id: string; first_name: string | null; last_name: string | null; display_name: string | null; username: string | null; city: string | null; current_rating: number; is_suspended: boolean; is_banned: boolean; onboarding_completed: boolean; match_ready: boolean; created_at: string };

function PlayersTab() {
  const [isPending, startTransition] = useTransition();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionPlayerId, setActionPlayerId] = useState<string | null>(null);
  const [ratingInput, setRatingInput] = useState("");
  const [ratingReason, setRatingReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await adminGetPlayers();
      if (res.error) setError(res.error);
      else setPlayers(res.players as PlayerRow[]);
    });
  }, []);

  function doSearch() {
    startTransition(async () => {
      const res = await adminGetPlayers(search || undefined);
      if (res.error) setError(res.error);
      else setPlayers(res.players as PlayerRow[]);
    });
  }

  function handleSuspend(p: PlayerRow) {
    startTransition(async () => {
      const res = await adminSuspendPlayer(p.id, !p.is_suspended, suspendReason);
      if (res.success) setPlayers((prev) => prev.map((x) => x.id === p.id ? { ...x, is_suspended: !p.is_suspended } : x));
      else setError(res.error ?? 'Failed');
      setExpandedId(null);
    });
  }

  function handleBan(p: PlayerRow) {
    startTransition(async () => {
      const res = await adminBanPlayer(p.id, !p.is_banned);
      if (res.success) setPlayers((prev) => prev.map((x) => x.id === p.id ? { ...x, is_banned: !p.is_banned } : x));
      else setError(res.error ?? 'Failed');
    });
  }

  function handleSetRating(p: PlayerRow) {
    const r = parseInt(ratingInput);
    if (isNaN(r)) { setError('Invalid rating'); return; }
    startTransition(async () => {
      const res = await adminSetPlayerRating(p.id, r, ratingReason || 'Admin override');
      if (res.success) setPlayers((prev) => prev.map((x) => x.id === p.id ? { ...x, current_rating: r } : x));
      else setError(res.error ?? 'Failed');
      setExpandedId(null);
    });
  }

  return (
    <div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="flex gap-2 mb-5">
        <input placeholder="Search players..." value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors" style={G} />
        <button onClick={doSearch} disabled={isPending} className="border border-brand-green text-brand-green px-4 py-2.5 text-[10px] tracking-widest uppercase hover:bg-brand-green/10 disabled:opacity-40 transition-colors" style={G}>
          {isPending ? '...' : 'Search'}
        </button>
      </div>
      <div className="space-y-2">
        {players.length === 0 && !isPending && <p className="text-white/30 text-center py-8 text-sm">No players found</p>}
        {players.map((p) => {
          const name = (p.display_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) || p.username || 'Player';
          const isExpanded = expandedId === p.id;
          return (
            <div key={p.id} className="border border-white/10 p-4" style={{ background: '#111' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/profile/${p.id}`} className="text-white text-sm font-bold hover:text-brand-green transition-colors" style={G}>{name.toUpperCase()}</Link>
                    {p.is_banned && <span className="text-[8px] px-1.5 py-0.5 tracking-wider" style={{ color: '#ef4444', border: '1px solid #ef444440' }}>BANNED</span>}
                    {p.is_suspended && <span className="text-[8px] px-1.5 py-0.5 tracking-wider" style={{ color: '#f97316', border: '1px solid #f9731640' }}>SUSPENDED</span>}
                    {!p.onboarding_completed && <span className="text-[8px] px-1.5 py-0.5 tracking-wider" style={{ color: '#666', border: '1px solid #33333380' }}>ONBOARDING</span>}
                  </div>
                  {p.username && <p className="text-white/30 text-[9px] mt-0.5">@{p.username}</p>}
                  {p.city && <p className="text-white/25 text-[9px]">{p.city}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-white text-lg font-bold" style={G}>{p.current_rating}</span>
                  <button onClick={() => setExpandedId(isExpanded ? null : p.id)} className="text-white/30 text-[9px] tracking-widest uppercase hover:text-white/60 transition-colors" style={G}>
                    {isExpanded ? 'Close' : 'Actions'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                  {/* Set rating */}
                  <div className="flex gap-2">
                    <input type="number" placeholder="New rating" value={ratingInput} onChange={(e) => setRatingInput(e.target.value)}
                      className="w-28 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-1.5 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
                    <input placeholder="Reason" value={ratingReason} onChange={(e) => setRatingReason(e.target.value)}
                      className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-1.5 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
                    <button onClick={() => handleSetRating(p)} disabled={isPending} className="border border-white/20 text-white/50 px-3 py-1.5 text-[9px] tracking-widest uppercase hover:border-white/40 disabled:opacity-40 transition-colors" style={G}>Set</button>
                  </div>
                  {/* Suspend / Ban */}
                  <div className="flex gap-2">
                    <input placeholder="Reason (optional)" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                      className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-1.5 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
                    <button onClick={() => handleSuspend(p)} disabled={isPending}
                      className="px-3 py-1.5 text-[9px] tracking-widest uppercase border disabled:opacity-40 transition-colors"
                      style={{ borderColor: p.is_suspended ? '#8CF702' : '#f97316', color: p.is_suspended ? '#8CF702' : '#f97316' }}>
                      {p.is_suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button onClick={() => handleBan(p)} disabled={isPending}
                      className="px-3 py-1.5 text-[9px] tracking-widest uppercase border border-red-500/50 text-red-400 hover:border-red-400 disabled:opacity-40 transition-colors" style={G}>
                      {p.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Matches Tab ──────────────────────────────────────────────

type MatchRow = { id: string; match_type: string; status: string; city: string | null; area: string | null; scheduled_date: string | null; created_at: string; team_a_name: string; team_b_name: string; source_type: string };

function MatchesTab() {
  const [isPending, startTransition] = useTransition();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await adminGetMatches(statusFilter);
      if (res.error) setError(res.error);
      else setMatches(res.matches as MatchRow[]);
    });
  }, [statusFilter]);

  const STATUS_OPTIONS = ["all", "disputed", "awaiting_confirmation", "processed", "voided", "confirmed", "auto_approved", "admin_resolved", "scheduled"];
  const STATUS_COLORS: Record<string, string> = { disputed: '#ef4444', awaiting_confirmation: '#f97316', processed: '#8CF702', confirmed: '#8CF702', auto_approved: '#8CF702', voided: '#555', admin_resolved: '#60a5fa', scheduled: '#888' };

  return (
    <div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`shrink-0 px-3 py-1.5 text-[10px] tracking-widest uppercase border transition-colors ${statusFilter === s ? 'border-brand-green text-brand-green bg-brand-green/5' : 'border-white/15 text-white/40'}`}
            style={G}>
            {s}
          </button>
        ))}
      </div>
      {isPending && <p className="text-white/30 text-center py-8" style={I}>Loading...</p>}
      <div className="space-y-2">
        {matches.length === 0 && !isPending && <p className="text-white/30 text-center py-8 text-sm">No matches</p>}
        {matches.map((m) => (
          <div key={m.id} className="border border-white/10 p-4" style={{ background: '#111' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[9px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: m.match_type === 'rivals_rated' ? '#8CF702' : '#60a5fa', border: `1px solid ${m.match_type === 'rivals_rated' ? '#8CF70240' : '#60a5fa40'}` }}>
                    {m.match_type === 'rivals_rated' ? 'Rated' : 'Friendly'}
                  </span>
                  <span className="text-[9px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: STATUS_COLORS[m.status] ?? '#888', border: `1px solid ${STATUS_COLORS[m.status] ?? '#888'}40` }}>
                    {m.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-white text-sm font-bold" style={G}>{m.team_a_name} <span className="text-white/30 font-normal">vs</span> {m.team_b_name}</p>
                <p className="text-white/30 text-[9px] mt-0.5" style={I}>{m.city}{m.area ? ` · ${m.area}` : ''}{m.scheduled_date ? ` · ${formatDate(m.scheduled_date)}` : ''}</p>
              </div>
              <Link href={`/matches/${m.id}`} className="text-brand-green text-[9px] tracking-widest uppercase hover:underline shrink-0" style={G}>View →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────

type SettingRow = { key: string; value: unknown; description: string | null };

function SettingsTab() {
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await adminGetSettings();
      if (res.error) setError(res.error);
      else setSettings(res.settings as SettingRow[]);
    });
  }, []);

  function handleSave(key: string) {
    startTransition(async () => {
      const res = await adminUpdateSetting(key, editValue);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSettings((prev) => prev.map((s) => s.key === key ? { ...s, value: editValue } : s));
      setEditKey(null);
      setSuccess(`${key} updated`);
      setTimeout(() => setSuccess(null), 2000);
    });
  }

  const grouped: Record<string, SettingRow[]> = {};
  for (const s of settings) {
    const prefix = s.key.split('_')[0] ?? 'OTHER';
    if (!grouped[prefix]) grouped[prefix] = [];
    grouped[prefix].push(s);
  }

  return (
    <div>
      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
      {success && <p className="text-brand-green text-xs mb-3">✓ {success}</p>}
      {isPending && settings.length === 0 && <p className="text-white/30 text-center py-8" style={I}>Loading...</p>}
      <div className="space-y-6">
        {Object.entries(grouped).map(([prefix, rows]) => (
          <div key={prefix}>
            <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>{prefix}</h3>
            <div className="space-y-1.5">
              {rows.map((s) => (
                <div key={s.key} className="border border-white/10 p-3" style={{ background: '#0d0d0d' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white/70 text-[10px] font-mono tracking-wider truncate">{s.key}</p>
                      {s.description && <p className="text-white/25 text-[9px] mt-0.5 leading-snug" style={I}>{s.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {editKey === s.key ? (
                        <>
                          <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            className="w-32 bg-transparent border border-brand-green text-white px-2 py-1 text-xs outline-none" style={I} />
                          <button onClick={() => handleSave(s.key)} disabled={isPending} className="text-brand-green text-[9px] tracking-widest hover:underline disabled:opacity-40" style={G}>Save</button>
                          <button onClick={() => setEditKey(null)} className="text-white/30 text-[9px] hover:text-white/60">✕</button>
                        </>
                      ) : (
                        <>
                          <span className="text-white/60 text-[10px] font-mono max-w-[120px] truncate" title={String(s.value)}>{String(s.value)}</span>
                          <button onClick={() => { setEditKey(s.key); setEditValue(typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)); }}
                            className="text-white/30 text-[9px] tracking-widest uppercase hover:text-white/60 transition-colors" style={G}>Edit</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bars Tab ─────────────────────────────────────────────────

type BarsEntry = { id: string; player_id: string; player_name: string; amount: number; status: string; source_type: string; created_at: string };

function BarsTab() {
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState<BarsEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Adjustment form
  const [adjPlayerId, setAdjPlayerId] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  // Global rating adjustment
  const [globalAmount, setGlobalAmount] = useState("");
  const [globalReason, setGlobalReason] = useState("");
  const [globalPreview, setGlobalPreview] = useState<number | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await adminGetBarsLedger();
      if (res.error) setError(res.error);
      else setEntries(res.entries as BarsEntry[]);
    });
  }, []);

  function doSearch() {
    startTransition(async () => {
      const res = await adminGetBarsLedger(search || undefined);
      if (res.error) setError(res.error);
      else setEntries(res.entries as BarsEntry[]);
    });
  }

  function handleAdjust() {
    const amt = parseFloat(adjAmount);
    if (isNaN(amt) || !adjPlayerId.trim()) { setError('Player ID and amount required'); return; }
    startTransition(async () => {
      const res = await adminAdjustBars(adjPlayerId.trim(), amt, adjReason);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess('Bars adjustment applied'); setAdjPlayerId(''); setAdjAmount(''); setAdjReason('');
      setTimeout(() => setSuccess(null), 3000);
      doSearch();
    });
  }

  async function handleGlobalPreview() {
    const amt = parseInt(globalAmount);
    if (isNaN(amt)) return;
    const res = await adminPreviewGlobalAdjustment(amt);
    setGlobalPreview(res.affectedCount);
  }

  function handleGlobalApply() {
    const amt = parseInt(globalAmount);
    if (isNaN(amt) || !globalReason.trim()) { setError('Amount and reason required'); return; }
    if (!confirm(`Apply ${amt > 0 ? '+' : ''}${amt} rating to ALL ${globalPreview ?? '?'} players? This cannot be undone automatically.`)) return;
    startTransition(async () => {
      const res = await adminApplyGlobalAdjustment(amt, globalReason);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess(`Global adjustment of ${amt > 0 ? '+' : ''}${amt} applied to ${res.affected} players`);
      setGlobalAmount(''); setGlobalReason(''); setGlobalPreview(null);
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {success && <p className="text-brand-green text-xs">✓ {success}</p>}

      {/* Manual adjustment */}
      <section>
        <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Manual Bars Adjustment</h3>
        <div className="border border-white/10 p-4 space-y-3" style={{ background: '#111' }}>
          <input placeholder="Player ID (UUID)" value={adjPlayerId} onChange={(e) => setAdjPlayerId(e.target.value)}
            className="w-full bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors font-mono" style={I} />
          <div className="flex gap-2">
            <input type="number" placeholder="Amount (+/-)" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)}
              className="w-32 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
            <input placeholder="Reason (required)" value={adjReason} onChange={(e) => setAdjReason(e.target.value)}
              className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
          </div>
          <button onClick={handleAdjust} disabled={isPending} className="border border-brand-green text-brand-green px-4 py-2 text-[10px] tracking-widest uppercase disabled:opacity-40 hover:bg-brand-green/10 transition-colors" style={G}>
            {isPending ? '...' : 'Apply Adjustment'}
          </button>
        </div>
      </section>

      {/* Global rating adjustment */}
      <section>
        <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Global Rating Adjustment</h3>
        <div className="border border-yellow-500/20 p-4 space-y-3" style={{ background: 'rgba(234,179,8,0.04)' }}>
          <p className="text-yellow-400/60 text-[9px] tracking-wider" style={I}>Applies a rating change to ALL active players. Use with caution.</p>
          <div className="flex gap-2">
            <input type="number" placeholder="+/- points" value={globalAmount} onChange={(e) => setGlobalAmount(e.target.value)} onBlur={handleGlobalPreview}
              className="w-32 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-yellow-500/50 transition-colors" style={I} />
            <input placeholder="Reason (required)" value={globalReason} onChange={(e) => setGlobalReason(e.target.value)}
              className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/25 px-3 py-2 text-sm outline-none focus:border-yellow-500/50 transition-colors" style={I} />
          </div>
          {globalPreview !== null && (
            <p className="text-yellow-400 text-[10px]" style={I}>This will affect {globalPreview} players.</p>
          )}
          <button onClick={handleGlobalApply} disabled={isPending || !globalAmount || !globalReason} className="border border-yellow-500/40 text-yellow-400 px-4 py-2 text-[10px] tracking-widest uppercase disabled:opacity-40 hover:bg-yellow-500/5 transition-colors" style={G}>
            {isPending ? '...' : 'Apply Global Adjustment'}
          </button>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Bars Ledger</h3>
        <div className="flex gap-2 mb-4">
          <input placeholder="Search by player name..." value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/25 px-4 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={G} />
          <button onClick={doSearch} disabled={isPending} className="border border-brand-green text-brand-green px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-brand-green/10 disabled:opacity-40 transition-colors" style={G}>
            {isPending ? '...' : 'Search'}
          </button>
        </div>
        <div className="space-y-1.5">
          {entries.length === 0 && !isPending && <p className="text-white/25 text-center py-8 text-sm">No entries</p>}
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-3 py-2.5 border border-white/5" style={{ background: '#0d0d0d' }}>
              <div>
                <p className="text-white/60 text-[10px] font-bold" style={G}>{e.player_name}</p>
                <p className="text-white/30 text-[9px]" style={I}>{e.source_type.replace(/_/g, ' ')} · {formatDate(e.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-sm" style={{ ...G, color: e.status === 'active' ? '#8CF702' : e.status === 'locked' ? '#f97316' : '#666' }}>
                  {Number(e.amount) % 1 === 0 ? Number(e.amount).toFixed(0) : Number(e.amount).toFixed(1)}
                </p>
                <p className="text-white/25 text-[8px] uppercase" style={G}>{e.status}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Quests Tab ───────────────────────────────────────────────

const QUEST_TYPES = [
  'play_x_rated_matches', 'win_x_rated_matches', 'beat_expected_x_times',
  'earn_x_bars', 'complete_first_match', 'maintain_winning_streak',
];

type TemplateRow = { id: string; name: string; quest_type: string; difficulty: string; access_level: string; status: string; is_repeating: boolean; created_at: string };
type InstanceRow = { id: string; name: string; status: string; starts_at: string; ends_at: string; reward_budget_total: number; reward_budget_used: number; max_completions: number | null; completions_count: number; template_id: string };

function QuestsTab() {
  const [isPending, startTransition] = useTransition();
  const [questTab, setQuestTab] = useState<'templates' | 'instances'>('instances');
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [instances, setInstances] = useState<InstanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Create template form
  const [showTplForm, setShowTplForm] = useState(false);
  const [tplForm, setTplForm] = useState({ name: '', description: '', quest_type: QUEST_TYPES[0], difficulty: 'medium', access_level: 'logged_in', objective_target: '5', is_repeating: false, repeat_frequency: '' });

  // Create instance form
  const [showInstForm, setShowInstForm] = useState(false);
  const [instForm, setInstForm] = useState({ templateId: '', name: '', description: '', starts_at: '', ends_at: '', reward_amount: '50', reward_budget_total: '500', max_completions: '' });

  useEffect(() => {
    load();
  }, []);

  function load() {
    startTransition(async () => {
      const [tRes, iRes] = await Promise.all([adminGetQuestTemplates(), adminGetQuestInstances()]);
      if (tRes.error) setError(tRes.error);
      else setTemplates(tRes.templates as TemplateRow[]);
      if (iRes.error) setError(iRes.error);
      else setInstances(iRes.instances as InstanceRow[]);
    });
  }

  function handleCreateTemplate() {
    if (!tplForm.name.trim()) { setError('Name required'); return; }
    startTransition(async () => {
      const res = await adminCreateQuestTemplate({
        name: tplForm.name.trim(),
        description: tplForm.description.trim(),
        quest_type: tplForm.quest_type,
        difficulty: tplForm.difficulty,
        access_level: tplForm.access_level,
        objective_target: parseInt(tplForm.objective_target) || 1,
        is_repeating: tplForm.is_repeating,
        repeat_frequency: tplForm.repeat_frequency || undefined,
      });
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess('Template created'); setShowTplForm(false);
      load(); setTimeout(() => setSuccess(null), 3000);
    });
  }

  function handleApproveTemplate(id: string) {
    startTransition(async () => {
      const res = await adminApproveQuestTemplate(id);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, status: 'approved' } : t));
    });
  }

  function handleCreateInstance() {
    if (!instForm.templateId || !instForm.name.trim() || !instForm.starts_at || !instForm.ends_at) { setError('Template, name, start and end dates required'); return; }
    startTransition(async () => {
      const res = await adminCreateQuestInstance({
        templateId: instForm.templateId,
        name: instForm.name.trim(),
        description: instForm.description.trim(),
        starts_at: instForm.starts_at,
        ends_at: instForm.ends_at,
        reward_amount: parseInt(instForm.reward_amount) || 50,
        reward_budget_total: parseInt(instForm.reward_budget_total) || 500,
        max_completions: instForm.max_completions ? parseInt(instForm.max_completions) : null,
      });
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess('Quest instance created and live'); setShowInstForm(false);
      load(); setTimeout(() => setSuccess(null), 3000);
    });
  }

  function handleEndInstance(id: string) {
    if (!confirm('End this quest instance now?')) return;
    startTransition(async () => {
      const res = await adminEndQuestInstance(id);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setInstances((prev) => prev.map((i) => i.id === id ? { ...i, status: 'ended' } : i));
    });
  }

  const diffColor: Record<string, string> = { easy: '#8CF702', medium: '#facc15', hard: '#f97316', elite: '#ef4444' };
  const statusColor: Record<string, string> = { live: '#8CF702', ended: '#555', draft: '#f97316', approved: '#60a5fa' };

  return (
    <div className="space-y-6">
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {success && <p className="text-brand-green text-xs">✓ {success}</p>}

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {(['instances', 'templates'] as const).map((t) => (
          <button key={t} onClick={() => setQuestTab(t)}
            className={`px-4 py-2 text-[10px] tracking-widest uppercase border transition-colors ${questTab === t ? 'border-brand-green text-brand-green bg-brand-green/5' : 'border-white/15 text-white/40'}`}
            style={G}>
            {t === 'instances' ? 'Live Quests' : 'Templates'}
          </button>
        ))}
      </div>

      {/* Instances view */}
      {questTab === 'instances' && (
        <div className="space-y-4">
          <button onClick={() => setShowInstForm((v) => !v)} className="border border-brand-green text-brand-green px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-brand-green/10 transition-colors" style={G}>
            {showInstForm ? '✕ Cancel' : '+ Create Quest Instance'}
          </button>

          {showInstForm && (
            <div className="border border-white/15 p-5 space-y-3" style={{ background: '#111' }}>
              <h4 className="text-white text-sm tracking-widest uppercase" style={G}>New Quest Instance</h4>
              <div className="space-y-2">
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Template</p>
                <select value={instForm.templateId} onChange={(e) => setInstForm((p) => ({ ...p, templateId: e.target.value }))}
                  className="w-full bg-[#111] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I}>
                  <option value="">Select template...</option>
                  {templates.filter((t) => t.status === 'approved').map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.quest_type})</option>
                  ))}
                </select>
              </div>
              {[
                { key: 'name' as const, label: 'Quest Name *', placeholder: 'Win 5 Rated Matches This Week' },
                { key: 'description' as const, label: 'Description', placeholder: 'Play and win 5 rated matches to earn 50 Bars.' },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>{f.label}</p>
                  <input placeholder={f.placeholder} value={instForm[f.key]} onChange={(e) => setInstForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Start Date *</p>
                  <input type="datetime-local" value={instForm.starts_at} onChange={(e) => setInstForm((p) => ({ ...p, starts_at: e.target.value }))}
                    className="w-full bg-transparent border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
                </div>
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>End Date *</p>
                  <input type="datetime-local" value={instForm.ends_at} onChange={(e) => setInstForm((p) => ({ ...p, ends_at: e.target.value }))}
                    className="w-full bg-transparent border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'reward_amount' as const, label: 'Reward (Bars)', placeholder: '50' },
                  { key: 'reward_budget_total' as const, label: 'Total Budget', placeholder: '500' },
                  { key: 'max_completions' as const, label: 'Max Players', placeholder: 'Unlimited' },
                ].map((f) => (
                  <div key={f.key} className="space-y-1">
                    <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>{f.label}</p>
                    <input type="number" placeholder={f.placeholder} value={instForm[f.key]} onChange={(e) => setInstForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
                  </div>
                ))}
              </div>
              <button onClick={handleCreateInstance} disabled={isPending}
                className="w-full bg-brand-green text-black py-3 text-sm tracking-widest uppercase font-bold disabled:opacity-40 hover:bg-brand-green/90 transition-colors" style={G}>
                {isPending ? 'Creating...' : 'Launch Quest →'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {instances.length === 0 && !isPending && <p className="text-white/25 text-center py-8 text-sm">No instances yet</p>}
            {instances.map((inst) => (
              <div key={inst.id} className="border border-white/10 p-4" style={{ background: '#111' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: statusColor[inst.status] ?? '#888', border: `1px solid ${statusColor[inst.status] ?? '#888'}40` }}>
                        {inst.status}
                      </span>
                    </div>
                    <p className="text-white text-sm font-bold" style={G}>{inst.name}</p>
                    <p className="text-white/30 text-[9px] mt-1" style={I}>
                      {formatDate(inst.starts_at)} → {formatDate(inst.ends_at)}
                    </p>
                    <div className="flex gap-3 mt-1">
                      <span className="text-white/40 text-[9px]" style={I}>{inst.completions_count}{inst.max_completions ? `/${inst.max_completions}` : ''} completions</span>
                      <span className="text-brand-green text-[9px]" style={I}>{inst.reward_budget_used}/{inst.reward_budget_total} Bars used</span>
                    </div>
                  </div>
                  {inst.status === 'live' && (
                    <button onClick={() => handleEndInstance(inst.id)} disabled={isPending} className="border border-red-500/40 text-red-400 px-3 py-1.5 text-[9px] tracking-widest uppercase hover:border-red-400 disabled:opacity-40 transition-colors shrink-0" style={G}>
                      End
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Templates view */}
      {questTab === 'templates' && (
        <div className="space-y-4">
          <button onClick={() => setShowTplForm((v) => !v)} className="border border-brand-green text-brand-green px-4 py-2 text-[10px] tracking-widest uppercase hover:bg-brand-green/10 transition-colors" style={G}>
            {showTplForm ? '✕ Cancel' : '+ New Template'}
          </button>

          {showTplForm && (
            <div className="border border-white/15 p-5 space-y-3" style={{ background: '#111' }}>
              <h4 className="text-white text-sm tracking-widest uppercase" style={G}>New Quest Template</h4>
              <div className="space-y-1">
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Template Name</p>
                <input placeholder="Win streak challenge" value={tplForm.name} onChange={(e) => setTplForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
              </div>
              <div className="space-y-1">
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Description</p>
                <input placeholder="Win a series of rated matches in a row." value={tplForm.description} onChange={(e) => setTplForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Quest Type</p>
                  <select value={tplForm.quest_type} onChange={(e) => setTplForm((p) => ({ ...p, quest_type: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I}>
                    {QUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Target</p>
                  <input type="number" placeholder="5" value={tplForm.objective_target} onChange={(e) => setTplForm((p) => ({ ...p, objective_target: e.target.value }))}
                    className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green" style={I} />
                </div>
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Difficulty</p>
                  <select value={tplForm.difficulty} onChange={(e) => setTplForm((p) => ({ ...p, difficulty: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I}>
                    {['easy', 'medium', 'hard', 'elite'].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Access</p>
                  <select value={tplForm.access_level} onChange={(e) => setTplForm((p) => ({ ...p, access_level: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I}>
                    {['logged_in', 'paid_only'].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={tplForm.is_repeating} onChange={(e) => setTplForm((p) => ({ ...p, is_repeating: e.target.checked }))} className="w-4 h-4 accent-brand-green" />
                <span className="text-white/60 text-[10px] tracking-wider" style={I}>Repeating quest</span>
              </label>
              {tplForm.is_repeating && (
                <div className="space-y-1">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Frequency</p>
                  <select value={tplForm.repeat_frequency} onChange={(e) => setTplForm((p) => ({ ...p, repeat_frequency: e.target.value }))}
                    className="w-full bg-[#0a0a0a] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green" style={I}>
                    <option value="">Select...</option>
                    {['daily', 'weekly', 'monthly'].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              )}
              <button onClick={handleCreateTemplate} disabled={isPending}
                className="w-full border border-brand-green text-brand-green py-3 text-sm tracking-widest uppercase disabled:opacity-40 hover:bg-brand-green/10 transition-colors" style={G}>
                {isPending ? '...' : 'Create Template'}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {templates.length === 0 && !isPending && <p className="text-white/25 text-center py-8 text-sm">No templates yet</p>}
            {templates.map((t) => (
              <div key={t.id} className="border border-white/10 p-4" style={{ background: '#111' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: diffColor[t.difficulty] ?? '#888', border: `1px solid ${diffColor[t.difficulty] ?? '#888'}40` }}>
                        {t.difficulty}
                      </span>
                      <span className="text-[9px] tracking-widest uppercase px-2 py-0.5" style={{ ...G, color: statusColor[t.status] ?? '#888', border: `1px solid ${statusColor[t.status] ?? '#888'}40` }}>
                        {t.status}
                      </span>
                    </div>
                    <p className="text-white text-sm font-bold" style={G}>{t.name}</p>
                    <p className="text-white/30 text-[9px] mt-0.5" style={I}>{t.quest_type} · {t.access_level}</p>
                  </div>
                  <div className="flex gap-2 items-start">
                    {t.status === 'draft' && (
                      <button onClick={() => handleApproveTemplate(t.id)} disabled={isPending}
                        className="border border-brand-green text-brand-green px-3 py-1.5 text-[9px] tracking-widest uppercase hover:bg-brand-green/10 disabled:opacity-40 transition-colors shrink-0" style={G}>
                        Approve
                      </button>
                    )}
                    <button onClick={() => { setInstForm((p) => ({ ...p, templateId: t.id, name: t.name })); setQuestTab('instances'); setShowInstForm(true); }}
                      className="border border-white/20 text-white/50 px-3 py-1.5 text-[9px] tracking-widest uppercase hover:border-white/40 shrink-0 transition-colors" style={G}>
                      Use
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
