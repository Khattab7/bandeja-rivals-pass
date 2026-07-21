"use client";

import { useState, useTransition, useEffect, useRef } from "react";
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
  adminPreviewAnnouncement, adminSendAnnouncement, adminGetAnnouncements,
  adminGetAnnouncementStats,
  adminSearchPlayersForAnnouncement,
  adminTestPush,
  adminListAdmins,
  adminSetAdminRole,
  type AnnouncementAudience,
} from "@/app/actions/admin";
import {
  adminListExploreTiles, adminCreateExploreTile, adminUpdateExploreTile,
  adminDeleteExploreTileRule, adminAddExploreTileRule, adminUploadTileImage,
  type ExploreTileCard, type CreateExploreTileInput,
} from "@/app/actions/explore";
import {
  SCENARIOS,
  calculateExpectedScore,
  calculateRatingChange,
  calculateSteps0RatingChange,
  roundHalfUp,
} from "@/lib/bandeja-rating";

const G = { fontFamily: "Gobold, Barlow Condensed, Arial Narrow, Arial, sans-serif" };
const I = { fontFamily: "var(--font-inter), Inter, system-ui, sans-serif" };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

type AdminTab = "members" | "phones" | "players" | "matches" | "settings" | "bars" | "quests" | "announce" | "simulator" | "explore" | "admins";

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
    { key: "announce", label: "Announce" },
    { key: "admins", label: "Admins" },
    { key: "simulator", label: "Simulator" },
    { key: "explore", label: "Explore" },
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
        {activeTab === "announce" && <AnnounceTab />}
        {activeTab === "admins" && <AdminsTab />}
        {activeTab === "simulator" && <SimulatorTab />}
        {activeTab === "explore" && <ExploreAdminTab />}
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

// ── Simulator Tab ─────────────────────────────────────────────

function SimulatorTab() {
  const [p1A, setP1A] = useState(500);
  const [p2A, setP2A] = useState(500);
  const [p1B, setP1B] = useState(500);
  const [p2B, setP2B] = useState(500);
  const [scenarioIndex, setScenarioIndex] = useState(5); // A wins 6-4
  const [barsReward, setBarsReward] = useState(100);

  // ── Pure math (no server call) ────────────────────────────
  const teamARating = (p1A + p2A) / 2;
  const teamBRating = (p1B + p2B) / 2;

  const expected = calculateExpectedScore(teamARating, teamBRating);
  const { steps, expectedScenarioIndex, favoredSide } = expected;

  const scenario = SCENARIOS.find((s) => s.index === scenarioIndex)!;
  const winningSide = scenario.winner as 'A' | 'B';

  const { teamAChange, teamBChange } = steps === 0
    ? calculateSteps0RatingChange(scenarioIndex)
    : calculateRatingChange(scenarioIndex, expectedScenarioIndex!);

  const aPlayerChange = roundHalfUp(teamAChange / 2);
  const bPlayerChange = roundHalfUp(teamBChange / 2);

  let beatExpectedSide: 'A' | 'B' | null;
  if (steps === 0) {
    beatExpectedSide = winningSide;
  } else if (expectedScenarioIndex === null || scenarioIndex === expectedScenarioIndex) {
    beatExpectedSide = null;
  } else {
    beatExpectedSide = (scenarioIndex - expectedScenarioIndex) < 0 ? 'A' : 'B';
  }
  const isExactExpected = steps > 0 && beatExpectedSide === null;

  function getBarsPerPlayer(side: 'A' | 'B'): number {
    if (steps === 0) return side === winningSide ? barsReward / 2 : 0;
    if (isExactExpected) return side === winningSide ? barsReward * 0.75 / 2 : barsReward * 0.25 / 2;
    const share = barsReward * 0.5 / 2;
    let amt = 0;
    if (side === winningSide) amt += share;
    if (side === beatExpectedSide) amt += share;
    return amt;
  }

  const aBars = getBarsPerPlayer('A');
  const bBars = getBarsPerPlayer('B');

  const aWinStreak = winningSide === 'A' ? 1 : 0;
  const bWinStreak = winningSide === 'B' ? 1 : 0;
  const aBeatExpStreak = steps === 0
    ? (winningSide === 'A' ? 1 : 0)
    : isExactExpected ? 0
    : (beatExpectedSide === 'A' ? 1 : 0);
  const bBeatExpStreak = steps === 0
    ? (winningSide === 'B' ? 1 : 0)
    : isExactExpected ? 0
    : (beatExpectedSide === 'B' ? 1 : 0);

  const expectedScenario = expectedScenarioIndex != null ? SCENARIOS.find((s) => s.index === expectedScenarioIndex) : null;
  const expectedLabel = expectedScenario
    ? `${expectedScenario.winner} wins ${expectedScenario.label}`
    : '—';

  const diffLabel = (() => {
    if (steps === 0) return 'Balanced (Steps = 0)';
    const side = favoredSide === 'A' ? 'Team A' : 'Team B';
    if (steps >= 5) return `${side} heavy favorite (Steps = ${steps})`;
    if (steps >= 3) return `${side} favorite (Steps = ${steps})`;
    return `${side} slight favorite (Steps = ${steps})`;
  })();

  const ratingFmt = (n: number) => {
    const s = n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
    return n > 0 ? `+${s}` : s;
  };
  const barsFmt = (n: number) => n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);

  // ── Bars breakdown label ──────────────────────────────────
  function barsBreakdown(side: 'A' | 'B'): string {
    if (steps === 0) return side === winningSide ? 'Winner (Steps=0 full pool)' : 'Did not win';
    if (isExactExpected) return side === winningSide ? 'Winner — exact expected (75%)' : 'Loser — exact expected (25%)';
    const parts: string[] = [];
    if (side === winningSide) parts.push('Winner (50%)');
    if (side === beatExpectedSide) parts.push('Beat expected (50%)');
    return parts.length ? parts.join(' + ') : 'Neither winner nor beat-expected';
  }

  // ── Input helpers ─────────────────────────────────────────
  function ratingInput(value: number, onChange: (v: number) => void, label: string) {
    return (
      <div className="space-y-1">
        <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>{label}</p>
        <input
          type="number"
          value={value}
          onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onChange(v); }}
          className="w-full bg-transparent border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors font-mono"
          style={I}
          min={100} max={2000}
        />
      </div>
    );
  }

  const changeColor = (n: number) => n > 0 ? '#8CF702' : n < 0 ? '#ef4444' : '#888';
  const streakColor = (n: number) => n > 0 ? '#8CF702' : '#888';

  return (
    <div className="max-w-3xl space-y-8">

      {/* ── Inputs ────────────────────────────────────────── */}
      <section>
        <h3 className="text-white/40 text-[9px] tracking-widest uppercase mb-4" style={G}>Match Inputs</h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Team A */}
          <div className="border border-white/10 p-4 space-y-3" style={{ background: '#111' }}>
            <p className="text-brand-green text-[10px] tracking-widest uppercase font-bold" style={G}>Team A</p>
            {ratingInput(p1A, setP1A, 'Player 1 Rating')}
            {ratingInput(p2A, setP2A, 'Player 2 Rating')}
            <div className="border-t border-white/10 pt-2">
              <p className="text-white/30 text-[9px]" style={I}>Avg: <span className="text-white font-mono">{teamARating % 1 === 0 ? teamARating : teamARating.toFixed(1)}</span></p>
            </div>
          </div>

          {/* Team B */}
          <div className="border border-white/10 p-4 space-y-3" style={{ background: '#111' }}>
            <p className="text-white/70 text-[10px] tracking-widest uppercase font-bold" style={G}>Team B</p>
            {ratingInput(p1B, setP1B, 'Player 1 Rating')}
            {ratingInput(p2B, setP2B, 'Player 2 Rating')}
            <div className="border-t border-white/10 pt-2">
              <p className="text-white/30 text-[9px]" style={I}>Avg: <span className="text-white font-mono">{teamBRating % 1 === 0 ? teamBRating : teamBRating.toFixed(1)}</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Score select */}
          <div className="space-y-1">
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Actual Score</p>
            <select
              value={scenarioIndex}
              onChange={(e) => setScenarioIndex(Number(e.target.value))}
              className="w-full bg-[#111] border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors"
              style={I}
            >
              <optgroup label="Team A wins">
                {SCENARIOS.filter((s) => s.winner === 'A').map((s) => (
                  <option key={s.index} value={s.index}>A wins {s.label}</option>
                ))}
              </optgroup>
              <optgroup label="Team B wins">
                {SCENARIOS.filter((s) => s.winner === 'B').map((s) => (
                  <option key={s.index} value={s.index}>B wins {s.label}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Bars reward */}
          <div className="space-y-1">
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Bars Reward (total per match)</p>
            <input
              type="number"
              value={barsReward}
              onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setBarsReward(v); }}
              className="w-full bg-transparent border border-white/20 text-white px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors font-mono"
              style={I}
              min={0}
            />
          </div>
        </div>
      </section>

      {/* ── Results ───────────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Calculated Results</h3>

        {/* Match context strip */}
        <div className="border border-white/10 p-4" style={{ background: '#0d0d0d' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="text-center">
              <p className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Team A Avg</p>
              <p className="text-white text-2xl font-bold font-mono" style={G}>{teamARating % 1 === 0 ? teamARating : teamARating.toFixed(1)}</p>
            </div>
            <div className="flex-1 text-center px-3">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] tracking-widest uppercase px-3 py-1 border" style={{
                  ...G,
                  color: steps === 0 ? '#888' : '#facc15',
                  borderColor: steps === 0 ? '#33333380' : '#facc1540',
                  background: steps === 0 ? 'transparent' : 'rgba(250,204,21,0.05)',
                }}>
                  {diffLabel}
                </span>
                {steps > 0 && (
                  <p className="text-white/30 text-[9px]" style={I}>
                    Expected: <span className="text-white/60">{expectedLabel}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="text-center">
              <p className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Team B Avg</p>
              <p className="text-white text-2xl font-bold font-mono" style={G}>{teamBRating % 1 === 0 ? teamBRating : teamBRating.toFixed(1)}</p>
            </div>
          </div>

          {/* Actual score result row */}
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
            <div>
              <p className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Actual Score</p>
              <p className="text-white text-base font-bold" style={G}>
                {scenario.winner} wins {scenario.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/30 text-[9px] tracking-widest uppercase" style={G}>Beat Expected</p>
              {beatExpectedSide ? (
                <p className="text-brand-green text-sm font-bold" style={G}>Team {beatExpectedSide}</p>
              ) : isExactExpected ? (
                <p className="text-white/40 text-sm" style={G}>Exact — neither</p>
              ) : (
                <p className="text-white/40 text-sm" style={G}>N/A (balanced)</p>
              )}
            </div>
          </div>
        </div>

        {/* Three result panels */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">

          {/* Rating changes */}
          <div className="border border-white/10 p-4 space-y-4" style={{ background: '#111' }}>
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Rating Changes</p>

            <div className="space-y-3">
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest" style={G}>Team A</p>
                <p className="text-2xl font-bold font-mono" style={{ ...G, color: changeColor(teamAChange) }}>
                  {ratingFmt(teamAChange)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ ...I, color: changeColor(aPlayerChange) }}>
                  {ratingFmt(aPlayerChange)} per player
                </p>
              </div>
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest" style={G}>Team B</p>
                <p className="text-2xl font-bold font-mono" style={{ ...G, color: changeColor(teamBChange) }}>
                  {ratingFmt(teamBChange)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ ...I, color: changeColor(bPlayerChange) }}>
                  {ratingFmt(bPlayerChange)} per player
                </p>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/25 text-[9px] leading-relaxed" style={I}>
                {steps === 0
                  ? 'Steps=0: gain = (7 − loser games) × 10'
                  : `Diff = ${scenarioIndex} − ${expectedScenarioIndex} = ${scenarioIndex - (expectedScenarioIndex ?? 0)}, change = diff × −10`}
              </p>
            </div>
          </div>

          {/* Bars */}
          <div className="border border-white/10 p-4 space-y-4" style={{ background: '#111' }}>
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Bars per Player</p>

            <div className="space-y-3">
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest" style={G}>Team A</p>
                <p className="text-2xl font-bold font-mono" style={{ ...G, color: aBars > 0 ? '#8CF702' : '#555' }}>
                  {barsFmt(aBars)}
                </p>
                <p className="text-white/30 text-[9px] mt-0.5 leading-snug" style={I}>{barsBreakdown('A')}</p>
              </div>
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest" style={G}>Team B</p>
                <p className="text-2xl font-bold font-mono" style={{ ...G, color: bBars > 0 ? '#8CF702' : '#555' }}>
                  {barsFmt(bBars)}
                </p>
                <p className="text-white/30 text-[9px] mt-0.5 leading-snug" style={I}>{barsBreakdown('B')}</p>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/25 text-[9px] leading-relaxed" style={I}>
                Total: {barsFmt(aBars * 2 + bBars * 2)} Bars distributed
                {' '}(of {barsReward} reward)
              </p>
            </div>
          </div>

          {/* Streaks */}
          <div className="border border-white/10 p-4 space-y-4" style={{ background: '#111' }}>
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Streak Impact</p>

            <div className="space-y-3">
              {/* Team A streaks */}
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest mb-1.5" style={G}>Team A</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>Win streak</span>
                    <span className="text-[10px] font-mono font-bold" style={{ ...G, color: streakColor(aWinStreak) }}>
                      {aWinStreak > 0 ? '+1' : 'Reset 0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>Beat-exp streak</span>
                    <span className="text-[10px] font-mono font-bold" style={{ ...G, color: streakColor(aBeatExpStreak) }}>
                      {aBeatExpStreak > 0 ? '+1' : isExactExpected ? 'Reset 0' : '0'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Team B streaks */}
              <div>
                <p className="text-white/30 text-[9px] uppercase tracking-widest mb-1.5" style={G}>Team B</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>Win streak</span>
                    <span className="text-[10px] font-mono font-bold" style={{ ...G, color: streakColor(bWinStreak) }}>
                      {bWinStreak > 0 ? '+1' : 'Reset 0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>Beat-exp streak</span>
                    <span className="text-[10px] font-mono font-bold" style={{ ...G, color: streakColor(bBeatExpStreak) }}>
                      {bBeatExpStreak > 0 ? '+1' : isExactExpected ? 'Reset 0' : '0'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/25 text-[9px] leading-relaxed" style={I}>
                {steps === 0
                  ? 'Steps=0: winner gets both win + beat-exp streak. Loser: both reset.'
                  : isExactExpected
                    ? 'Exact expected: both beat-exp streaks reset. Winner win-streak +1.'
                    : `Team ${beatExpectedSide} beat expected: their beat-exp streak +1.`}
              </p>
            </div>
          </div>
        </div>

        {/* New ratings preview */}
        <div className="border border-white/10 p-4" style={{ background: '#0d0d0d' }}>
          <p className="text-white/40 text-[9px] tracking-widest uppercase mb-3" style={G}>Resulting Ratings</p>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>Team A</p>
              <div className="space-y-1">
                {[p1A, p2A].map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>P{i + 1}</span>
                    <span className="text-[10px] font-mono" style={I}>
                      <span className="text-white/40">{r}</span>
                      <span style={{ color: changeColor(aPlayerChange) }}> {ratingFmt(aPlayerChange)}</span>
                      <span className="text-white"> = {r + aPlayerChange}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white/30 text-[9px] tracking-widest uppercase mb-2" style={G}>Team B</p>
              <div className="space-y-1">
                {[p1B, p2B].map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-white/40 text-[9px]" style={I}>P{i + 1}</span>
                    <span className="text-[10px] font-mono" style={I}>
                      <span className="text-white/40">{r}</span>
                      <span style={{ color: changeColor(bPlayerChange) }}> {ratingFmt(bPlayerChange)}</span>
                      <span className="text-white"> = {r + bPlayerChange}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Admins Tab ────────────────────────────────────────────────

type AdminUser = { user_id: string; player_id: string | null; email: string; name: string };

function AdminsTab() {
  const [isPending, startTransition] = useTransition();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerRow[]>([]);

  useEffect(() => { load(); }, []);

  function load() {
    startTransition(async () => {
      const res = await adminListAdmins();
      if ('error' in res && res.error) setError(res.error);
      else setAdmins(res.admins as AdminUser[]);
    });
  }

  function handleSearch() {
    if (!search.trim()) return;
    startTransition(async () => {
      const res = await adminGetPlayers(search);
      if (!res.error) setSearchResults(res.players as PlayerRow[]);
    });
  }

  function handleGrant(playerId: string) {
    startTransition(async () => {
      const res = await adminSetAdminRole(playerId, true);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess('Admin access granted'); setSearchResults([]); setSearch('');
      load(); setTimeout(() => setSuccess(null), 3000);
    });
  }

  function handleRevoke(playerId: string | null, name: string) {
    if (!playerId) return;
    if (!confirm(`Revoke admin access for ${name}?`)) return;
    startTransition(async () => {
      const res = await adminSetAdminRole(playerId, false);
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess('Admin access revoked');
      load(); setTimeout(() => setSuccess(null), 3000);
    });
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {success && <p className="text-brand-green text-xs">✓ {success}</p>}

      {/* Current admins */}
      <section>
        <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Current Admins</h3>
        {isPending && admins.length === 0 && <p className="text-white/30 text-sm text-center py-4" style={I}>Loading...</p>}
        <div className="space-y-2">
          {admins.length === 0 && !isPending && (
            <p className="text-white/20 text-center py-4 text-sm" style={I}>No admins found</p>
          )}
          {admins.map((a) => (
            <div key={a.user_id} className="border border-white/10 p-4 flex items-center justify-between gap-4" style={{ background: '#111' }}>
              <div className="min-w-0">
                <p className="text-white text-sm font-bold truncate" style={G}>{a.name.toUpperCase()}</p>
                <p className="text-white/40 text-[9px] mt-0.5 truncate">{a.email}</p>
              </div>
              {a.player_id ? (
                <button
                  onClick={() => handleRevoke(a.player_id, a.name)}
                  disabled={isPending}
                  className="shrink-0 border border-red-500/30 text-red-400/70 px-3 py-1.5 text-[9px] tracking-widest uppercase hover:border-red-400 hover:text-red-400 disabled:opacity-40 transition-colors"
                  style={G}
                >
                  Revoke
                </button>
              ) : (
                <span className="text-white/20 text-[9px]" style={G}>No profile</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Grant admin */}
      <section>
        <h3 className="text-white/30 text-[9px] tracking-widest uppercase mb-3" style={G}>Grant Admin Access</h3>
        <div className="flex gap-2 mb-4">
          <input
            placeholder="Search player by name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-transparent border border-white/20 text-white placeholder-white/30 px-4 py-2.5 text-sm outline-none focus:border-brand-green transition-colors"
            style={G}
          />
          <button
            onClick={handleSearch}
            disabled={isPending || !search.trim()}
            className="border border-brand-green text-brand-green px-4 py-2.5 text-[10px] tracking-widest uppercase hover:bg-brand-green/10 disabled:opacity-40 transition-colors"
            style={G}
          >
            {isPending ? '...' : 'Search'}
          </button>
        </div>
        <div className="space-y-2">
          {searchResults.map((p) => {
            const name = (p.display_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) || p.username || 'Player';
            const alreadyAdmin = admins.some((a) => a.player_id === p.id);
            return (
              <div key={p.id} className="border border-white/10 p-3 flex items-center justify-between gap-3" style={{ background: '#0d0d0d' }}>
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold" style={G}>{name.toUpperCase()}</p>
                  {p.username && <p className="text-white/30 text-[9px] mt-0.5" style={I}>@{p.username}</p>}
                </div>
                {alreadyAdmin ? (
                  <span className="text-brand-green text-[9px] tracking-widest uppercase shrink-0" style={G}>Already Admin</span>
                ) : (
                  <button
                    onClick={() => handleGrant(p.id)}
                    disabled={isPending}
                    className="shrink-0 border border-brand-green text-brand-green px-3 py-1.5 text-[9px] tracking-widest uppercase hover:bg-brand-green/10 disabled:opacity-40 transition-colors"
                    style={G}
                  >
                    Grant Admin
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Announce Tab ──────────────────────────────────────────────

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  target_filters_json: Record<string, unknown> | null;
  status: string;
  sent_at: string | null;
  audience_count: number | null;
  created_at: string;
};

type AnnounceStats = { total: number; inAppRead: number; pushDelivered: number; pushTapped: number };

type PlayerResult = { player_id: string; user_id: string; display_name: string };

function AnnounceTab() {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [city, setCity] = useState('');
  // Specific users
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerResult[]>([]);

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<AnnouncementRow[]>([]);
  const [expandedStats, setExpandedStats] = useState<string | null>(null);
  const [statsCache, setStatsCache] = useState<Record<string, AnnounceStats>>({});
  const [loadingStats, setLoadingStats] = useState<string | null>(null);
  const [pushDiag, setPushDiag] = useState<Awaited<ReturnType<typeof adminTestPush>> | null>(null);
  const [testingPush, setTestingPush] = useState(false);

  useEffect(() => {
    startTransition(async () => {
      const res = await adminGetAnnouncements();
      if (!res.error) setHistory(res.announcements as AnnouncementRow[]);
    });
  }, []);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const res = await adminSearchPlayersForAnnouncement(searchQuery);
    setSearchResults(res.players as PlayerResult[]);
    setSearching(false);
  }

  function addPlayer(p: PlayerResult) {
    if (selectedPlayers.some((s) => s.player_id === p.player_id)) return;
    setSelectedPlayers((prev) => [...prev, p]);
    setPreviewCount(null);
  }

  function removePlayer(playerId: string) {
    setSelectedPlayers((prev) => prev.filter((p) => p.player_id !== playerId));
    setPreviewCount(null);
  }

  async function handlePreview() {
    setPreviewing(true); setPreviewCount(null); setError(null);
    const res = await adminPreviewAnnouncement(
      audience,
      audience === 'city' ? city : undefined,
      audience === 'specific' ? selectedPlayers.map((p) => p.player_id) : undefined,
    );
    setPreviewCount(res.count);
    setPreviewing(false);
  }

  function handleSend() {
    if (!title.trim() || !body.trim()) { setError('Title and body are required.'); return; }
    if (audience === 'city' && !city.trim()) { setError('Enter a city name.'); return; }
    if (audience === 'specific' && selectedPlayers.length === 0) { setError('Select at least one player.'); return; }
    setError(null);
    startTransition(async () => {
      const res = await adminSendAnnouncement({
        title, body, audience,
        city: audience === 'city' ? city : undefined,
        specificPlayerIds: audience === 'specific' ? selectedPlayers.map((p) => p.player_id) : undefined,
      });
      if (!res.success) { setError(res.error ?? 'Failed'); return; }
      setSuccess(`Sent to ${res.sent} of ${res.total} users.`);
      setTitle(''); setBody(''); setPreviewCount(null);
      if (audience === 'specific') { setSelectedPlayers([]); setSearchQuery(''); setSearchResults([]); }
      const hist = await adminGetAnnouncements();
      if (!hist.error) setHistory(hist.announcements as AnnouncementRow[]);
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  async function handleToggleStats(id: string) {
    if (expandedStats === id) { setExpandedStats(null); return; }
    setExpandedStats(id);
    if (statsCache[id]) return;
    setLoadingStats(id);
    const res = await adminGetAnnouncementStats(id);
    setStatsCache((prev) => ({ ...prev, [id]: res }));
    setLoadingStats(null);
  }

  const AUDIENCE_OPTS: { key: AnnouncementAudience; label: string }[] = [
    { key: 'all', label: 'All Players' },
    { key: 'paid', label: 'Paid Members' },
    { key: 'free', label: 'Free Players' },
    { key: 'city', label: 'By City' },
    { key: 'specific', label: 'Specific Users' },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-white text-sm tracking-widest uppercase mb-4" style={G}>Send Announcement</h2>

        {error && <div className="border border-red-500/30 bg-red-500/10 text-red-400 text-xs px-4 py-3 mb-4" style={I}>{error}</div>}
        {success && <div className="border border-brand-green/30 bg-brand-green/10 text-brand-green text-xs px-4 py-3 mb-4" style={I}>{success}</div>}

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-white/40 text-[9px] tracking-widest uppercase block mb-1.5" style={G}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title…"
              className="w-full bg-white/5 border border-white/15 text-white px-4 py-2.5 text-sm outline-none focus:border-brand-green/50 transition-colors" style={I} />
          </div>

          {/* Body */}
          <div>
            <label className="text-white/40 text-[9px] tracking-widest uppercase block mb-1.5" style={G}>Message</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your announcement…" rows={4}
              className="w-full bg-white/5 border border-white/15 text-white px-4 py-2.5 text-sm outline-none focus:border-brand-green/50 transition-colors resize-none" style={I} />
          </div>

          {/* Audience */}
          <div>
            <label className="text-white/40 text-[9px] tracking-widest uppercase block mb-1.5" style={G}>Audience</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCE_OPTS.map(({ key, label }) => (
                <button key={key}
                  onClick={() => { setAudience(key); setPreviewCount(null); setSearchResults([]); }}
                  className="px-4 py-1.5 text-[9px] tracking-widest uppercase border transition-colors"
                  style={{ ...G, borderColor: audience === key ? '#8CF702' : 'rgba(255,255,255,0.15)', color: audience === key ? '#8CF702' : 'rgba(255,255,255,0.4)', background: audience === key ? 'rgba(140,247,2,0.07)' : 'transparent' }}>
                  {label}
                </button>
              ))}
            </div>

            {audience === 'city' && (
              <input value={city} onChange={(e) => { setCity(e.target.value); setPreviewCount(null); }}
                placeholder="City name (e.g. Cairo)"
                className="mt-2 w-full bg-white/5 border border-white/15 text-white px-4 py-2.5 text-sm outline-none focus:border-brand-green/50 transition-colors" style={I} />
            )}

            {audience === 'specific' && (
              <div className="mt-3 space-y-3">
                {/* Selected players chips */}
                {selectedPlayers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedPlayers.map((p) => (
                      <span key={p.player_id} className="flex items-center gap-1.5 px-2.5 py-1 border border-brand-green/40 bg-brand-green/5 text-brand-green text-[10px] tracking-wider" style={G}>
                        {p.display_name.toUpperCase()}
                        <button onClick={() => removePlayer(p.player_id)} className="text-brand-green/50 hover:text-brand-green ml-0.5">✕</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Search box */}
                <div className="flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search by name or phone number…"
                    className="flex-1 bg-white/5 border border-white/15 text-white placeholder-white/25 px-4 py-2.5 text-sm outline-none focus:border-brand-green/50 transition-colors"
                    style={I}
                  />
                  <button onClick={handleSearch} disabled={searching || !searchQuery.trim()}
                    className="border border-white/20 text-white/50 px-4 py-2 text-[9px] tracking-widest uppercase hover:border-white/40 disabled:opacity-40 transition-colors shrink-0" style={G}>
                    {searching ? '…' : 'Search'}
                  </button>
                </div>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <div className="border border-white/10 divide-y divide-white/5" style={{ background: '#0d0d0d' }}>
                    {searchResults.map((p) => {
                      const already = selectedPlayers.some((s) => s.player_id === p.player_id);
                      return (
                        <div key={p.player_id} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-white/70 text-sm" style={G}>{p.display_name.toUpperCase()}</span>
                          <button onClick={() => addPlayer(p)} disabled={already}
                            className="text-[9px] tracking-widest uppercase border px-3 py-1 transition-colors disabled:opacity-30"
                            style={{ ...G, borderColor: already ? '#444' : '#8CF702', color: already ? '#555' : '#8CF702' }}>
                            {already ? 'Added' : '+ Add'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {searchResults.length === 0 && searchQuery && !searching && (
                  <p className="text-white/25 text-xs" style={I}>No players found.</p>
                )}
              </div>
            )}
          </div>

          {/* Preview + Send */}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={handlePreview} disabled={previewing || isPending || (audience === 'specific' && selectedPlayers.length === 0)}
              className="border border-white/20 text-white/50 px-4 py-2 text-[9px] tracking-widest uppercase hover:border-white/40 transition-colors disabled:opacity-40" style={G}>
              {previewing ? 'Counting…' : 'Preview Audience'}
            </button>
            {previewCount !== null && (
              <span className="text-brand-green text-xs" style={I}>{previewCount} {previewCount === 1 ? 'player' : 'players'} will receive this</span>
            )}
            <button onClick={handleSend} disabled={isPending || !title.trim() || !body.trim() || (audience === 'specific' && selectedPlayers.length === 0)}
              className="ml-auto bg-brand-green text-brand-dark px-5 py-2 text-[9px] tracking-widest uppercase font-bold hover:bg-brand-green/90 transition-colors disabled:opacity-40" style={G}>
              {isPending ? 'Sending…' : 'Send Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Push diagnostics */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Push Diagnostics</h2>
          <button
            onClick={async () => { setTestingPush(true); setPushDiag(null); const r = await adminTestPush(); setPushDiag(r); setTestingPush(false); }}
            disabled={testingPush}
            className="border border-white/20 text-white/50 px-3 py-1 text-[9px] tracking-widest uppercase hover:border-white/40 disabled:opacity-40 transition-colors"
            style={G}
          >
            {testingPush ? '...' : 'Send Test Push to Me'}
          </button>
        </div>
        {pushDiag && (
          <div className="border border-white/10 p-4 space-y-2 text-[10px]" style={{ background: '#0d0d0d', fontFamily: 'monospace' }}>
            <p style={{ color: pushDiag.vapidConfigured ? '#8CF702' : '#ef4444' }}>
              VAPID: {pushDiag.vapidConfigured ? '✓ configured' : `✗ missing: ${pushDiag.missingVars.join(', ')}`}
            </p>
            <p style={{ color: pushDiag.subscriptionCount > 0 ? '#8CF702' : '#f97316' }}>
              Subscriptions: {pushDiag.subscriptionCount} {pushDiag.subscriptionCount === 0 ? '— no devices subscribed for your account' : ''}
            </p>
            {pushDiag.results.map((r, i) => (
              <p key={i} style={{ color: r.status === 'sent' ? '#8CF702' : '#ef4444' }}>
                [{r.endpoint}] {r.status}{r.statusCode ? ` (${r.statusCode})` : ''}{r.error ? `: ${r.error}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <h2 className="text-white text-sm tracking-widest uppercase mb-3" style={G}>Past Announcements</h2>
          <div className="space-y-2">
            {history.map((a) => {
              const filters = a.target_filters_json as { audience?: string; city?: string; player_ids?: string[] } | null;
              const audienceLabel =
                filters?.audience === 'paid' ? 'Paid Members' :
                filters?.audience === 'free' ? 'Free Players' :
                filters?.audience === 'city' ? `City: ${filters.city}` :
                filters?.audience === 'specific' ? `${filters.player_ids?.length ?? 0} specific users` :
                'All Players';
              const isOpen = expandedStats === a.id;
              const stats = statsCache[a.id];
              return (
                <div key={a.id} className="border border-white/10" style={{ background: '#0d0d0d' }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-xs tracking-wider uppercase truncate" style={G}>{a.title}</p>
                        <p className="text-white/50 text-xs mt-0.5 line-clamp-2" style={I}>{a.body}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-brand-green text-[9px] tracking-widest uppercase" style={G}>{audienceLabel}</p>
                        <p className="text-white/30 text-[10px] mt-0.5" style={I}>{a.audience_count ?? '—'} sent</p>
                        <p className="text-white/20 text-[10px] mt-0.5" style={I}>{a.sent_at ? formatDate(a.sent_at) : '—'}</p>
                      </div>
                    </div>
                    <button onClick={() => handleToggleStats(a.id)} disabled={loadingStats === a.id}
                      className="mt-3 text-[9px] tracking-widest uppercase transition-colors disabled:opacity-40"
                      style={{ ...G, color: isOpen ? 'rgba(255,255,255,0.3)' : '#8CF702' }}>
                      {loadingStats === a.id ? 'Loading…' : isOpen ? '▲ Hide Stats' : '▼ View Stats'}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-white/10 px-4 py-3">
                      {!stats ? (
                        <p className="text-white/30 text-[10px]" style={I}>Loading…</p>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Sent', value: stats.total, color: '#fff' },
                            { label: 'In-App Read', value: stats.inAppRead, color: '#8CF702' },
                            { label: 'Push Delivered', value: stats.pushDelivered, color: '#60a5fa' },
                            { label: 'Push Tapped', value: stats.pushTapped, color: '#f97316' },
                          ].map((s) => (
                            <div key={s.label} className="text-center border border-white/5 py-2 px-1" style={{ background: '#111' }}>
                              <p style={{ color: s.color, ...G }} className="text-lg font-bold">{s.value}</p>
                              <p className="text-white/30 text-[8px] tracking-widest uppercase mt-0.5" style={G}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Explore Admin Tab ────────────────────────────────────────────────────────

const ELIGIBILITY_KEYS = [
  'my_rating_min', 'my_rating_max', 'rating_min', 'rating_max',
  'gender_rule', 'match_history', 'ready_tonight', 'paid_membership',
];
const RANKING_KEYS = [
  'rating_balance', 'higher_rated_opponents', 'lower_rated_opponents',
  'same_area', 'ready_tonight', 'never_played',
];
const ACCESS_LEVELS = ['everyone', 'paid_members_only', 'free_locked_preview', 'invitation_only', 'admin_testing_only'];
const TILE_STATUSES = ['draft', 'pending_approval', 'approved', 'scheduled', 'live', 'paused', 'ended', 'archived', 'cancelled'];

type TileRow = Awaited<ReturnType<typeof adminListExploreTiles>>["tiles"][0];

function ExploreAdminTab() {
  const [isPending, startTransition] = useTransition();
  const [tiles, setTiles] = useState<TileRow[]>([]);
  const [tabError, setTabError] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateExploreTileInput>({ title: "", access_level: "everyone" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [addRuleType, setAddRuleType] = useState<"eligibility" | "ranking">("eligibility");
  const [newRuleKey, setNewRuleKey] = useState("my_rating_min");
  const [newRuleMode, setNewRuleMode] = useState<"mandatory" | "notify_only">("mandatory");
  const [newRuleValue, setNewRuleValue] = useState("");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function loadTiles() {
    setTabError(null);
    startTransition(async () => {
      const res = await adminListExploreTiles();
      if (res.error) { setTabError(res.error); return; }
      setTiles(res.tiles);
    });
  }

  useEffect(() => { loadTiles(); }, []);

  function handleCreate() {
    setCreateError(null);
    if (!createForm.title.trim()) { setCreateError("Title is required"); return; }
    startTransition(async () => {
      const res = await adminCreateExploreTile({ ...createForm, title: createForm.title.trim() });
      if (res.error) { setCreateError(res.error); return; }
      setShowCreateForm(false);
      setCreateForm({ title: "", access_level: "everyone" });
      loadTiles();
    });
  }

  function handleStatusChange(tileId: string, status: string) {
    setStatusUpdating(tileId);
    startTransition(async () => {
      await adminUpdateExploreTile(tileId, { status });
      setStatusUpdating(null);
      loadTiles();
    });
  }

  function handleAddRule() {
    if (!selectedTileId) return;
    setRuleError(null);
    let parsedValue: unknown = newRuleValue;
    if (["my_rating_min", "my_rating_max", "rating_min", "rating_max"].includes(newRuleKey)) {
      const n = Number(newRuleValue);
      if (isNaN(n)) { setRuleError("Value must be a number for rating rules"); return; }
      parsedValue = n;
    } else if (newRuleKey === "ready_tonight" || newRuleKey === "paid_membership") {
      parsedValue = true;
    }
    startTransition(async () => {
      const res = await adminAddExploreTileRule(selectedTileId, addRuleType, {
        rule_key: addRuleType === "eligibility" ? newRuleKey : undefined,
        rule_mode: addRuleType === "eligibility" ? newRuleMode : undefined,
        rule_value_json: addRuleType === "eligibility" ? parsedValue : undefined,
        signal_key: addRuleType === "ranking" ? newRuleKey : undefined,
        weight: addRuleType === "ranking" ? (Number(newRuleValue) || 1) : undefined,
        priority: 0,
      });
      if (res.error) { setRuleError(res.error); return; }
      setNewRuleValue("");
      loadTiles();
    });
  }

  function handleDeleteRule(ruleId: string, type: "eligibility" | "ranking") {
    startTransition(async () => {
      await adminDeleteExploreTileRule(ruleId, type);
      loadTiles();
    });
  }

  async function handleImageUpload(tileId: string, file: File) {
    setImageError(null);
    setImageUploading(tileId);
    const fd = new FormData();
    fd.append('file', file);
    const res = await adminUploadTileImage(tileId, fd);
    if (res.error) { setImageError('Upload failed: ' + res.error); setImageUploading(null); return; }
    setImageUploading(null);
    loadTiles();
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-sm tracking-widest uppercase" style={G}>Explore Tiles</h2>
        <button onClick={() => setShowCreateForm((v) => !v)}
          className="text-[10px] tracking-widest uppercase bg-brand-green text-black px-3 py-1.5 hover:bg-brand-green/90 transition-colors" style={G}>
          + New Tile
        </button>
      </div>

      {tabError && <p className="text-red-400 text-sm" style={I}>{tabError}</p>}
      {isPending && tiles.length === 0 && <p className="text-white/30 text-sm" style={I}>Loading...</p>}

      {showCreateForm && (
        <div className="border border-white/20 p-4 space-y-3 bg-[#0a0a0a]">
          <p className="text-white text-xs tracking-widest uppercase" style={G}>Create Tile</p>
          {(["title", "subtitle", "description", "background_color"] as const).map((key) => (
            <div key={key} className="space-y-1">
              <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>{key.replace(/_/g, " ")}</p>
              <input placeholder={key === "background_color" ? "#0d1a00" : key} maxLength={200}
                className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                value={(createForm[key] as string) ?? ""}
                onChange={(e) => setCreateForm((p) => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Access Level</p>
            <select className="w-full bg-[#111] border border-white/20 text-white px-3 py-2 text-sm outline-none" style={I}
              value={createForm.access_level}
              onChange={(e) => setCreateForm((p) => ({ ...p, access_level: e.target.value }))}>
              {ACCESS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            {(["max_visible_candidates", "max_challenges_per_team"] as const).map((k) => (
              <div key={k} className="flex-1 space-y-1">
                <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>{k.replace(/_/g, " ")}</p>
                <input type="number" placeholder="--"
                  className="w-full bg-transparent border border-white/20 text-white placeholder-white/20 px-3 py-2 text-sm outline-none focus:border-brand-green transition-colors" style={I}
                  value={(createForm[k] as number | null | undefined) ?? ""}
                  onChange={(e) => setCreateForm((p) => ({ ...p, [k]: e.target.value ? Number(e.target.value) : null }))} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="expl_featured" checked={!!createForm.is_featured}
              onChange={(e) => setCreateForm((p) => ({ ...p, is_featured: e.target.checked }))} />
            <label htmlFor="expl_featured" className="text-white/50 text-xs" style={I}>Featured (large card)</label>
          </div>
          {createError && <p className="text-red-400 text-xs" style={I}>{createError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={isPending}
              className="flex-1 bg-brand-green text-black py-2 text-xs tracking-widest uppercase font-bold disabled:opacity-40" style={G}>
              {isPending ? "Creating..." : "Create Tile"}
            </button>
            <button onClick={() => setShowCreateForm(false)} className="border border-white/20 text-white/40 px-4 py-2 text-xs tracking-widest uppercase" style={G}>Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {tiles.map((tile) => (
          <div key={tile.id} className={`border p-4 space-y-3 ${tile.id === selectedTileId ? "border-brand-green/40" : "border-white/10"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white text-sm tracking-widest uppercase truncate" style={G}>{tile.title}</p>
                  {tile.is_featured && <span className="text-[8px] tracking-widest uppercase px-1.5 py-0.5 bg-brand-green/10 text-brand-green border border-brand-green/20" style={G}>Featured</span>}
                </div>
                {tile.subtitle && <p className="text-white/40 text-xs mt-0.5" style={I}>{tile.subtitle}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[8px] tracking-widest uppercase px-1.5 py-0.5 border border-white/15 text-white/40" style={G}>{tile.access_level}</span>
                  <span className={`text-[8px] tracking-widest uppercase px-1.5 py-0.5 border ${tile.status === "live" ? "text-brand-green border-brand-green/30 bg-brand-green/5" : tile.status === "draft" ? "text-white/40 border-white/10" : "text-yellow-400 border-yellow-400/20"}`} style={G}>{tile.status}</span>
                </div>
                <p className="text-white/20 text-[9px] mt-1 font-mono">{tile.id}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <select disabled={statusUpdating === tile.id}
                  className="bg-[#111] border border-white/20 text-white text-[10px] px-2 py-1 outline-none" style={G}
                  value={tile.status}
                  onChange={(e) => handleStatusChange(tile.id, e.target.value)}>
                  {TILE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => setSelectedTileId(tile.id === selectedTileId ? null : tile.id)}
                  className="text-[9px] tracking-widest uppercase border border-white/15 text-white/40 px-2 py-1 hover:border-white/30 transition-colors" style={G}>
                  {tile.id === selectedTileId ? "Close" : "Rules"}
                </button>
              </div>
            </div>

            {tile.id === selectedTileId && (
              <div className="border-t border-white/10 pt-3 space-y-4">

                {/* Cover image */}
                <div className="space-y-2">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Cover Image</p>
                  {tile.cover_image_url && (
                    <div className="relative w-full h-28 overflow-hidden border border-white/10">
                      <img src={tile.cover_image_url} alt="" className="w-full h-full object-cover" />
                      <button
                        onClick={() => { startTransition(async () => { await adminUpdateExploreTile(tile.id, { image_url: null }); loadTiles(); }); }}
                        className="absolute top-1.5 right-1.5 bg-black/70 text-white/60 text-[9px] px-2 py-1 hover:text-red-400 transition-colors"
                        style={G}>Remove</button>
                    </div>
                  )}
                  {imageError && <p className="text-red-400 text-[10px]" style={I}>{imageError}</p>}
                  <button
                    onClick={() => { imageInputRef.current?.click(); imageInputRef.current && (imageInputRef.current.dataset.tile = tile.id); }}
                    disabled={imageUploading === tile.id}
                    className="border border-white/20 text-white/50 px-3 py-1.5 text-[9px] tracking-widest uppercase hover:border-brand-green hover:text-brand-green disabled:opacity-40 transition-colors"
                    style={G}>
                    {imageUploading === tile.id ? 'Uploading...' : tile.cover_image_url ? 'Replace Image' : '+ Upload Image'}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Eligibility Rules</p>
                  {tile.eligibility_rules.length === 0 && <p className="text-white/20 text-xs" style={I}>None</p>}
                  {tile.eligibility_rules.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 border border-white/10 px-3 py-2">
                      <div>
                        <span className="text-white text-xs font-mono">{r.rule_key}</span>
                        <span className="text-white/40 text-xs ml-2" style={I}>= {JSON.stringify(r.rule_value_json)}</span>
                        <span className={`text-[8px] tracking-widest uppercase ml-2 px-1 py-0.5 border ${r.rule_mode === "mandatory" ? "text-brand-green border-brand-green/20" : "text-yellow-400 border-yellow-400/20"}`} style={G}>{r.rule_mode}</span>
                      </div>
                      <button onClick={() => handleDeleteRule(r.id, "eligibility")} className="text-white/20 text-xs hover:text-red-400 transition-colors">X</button>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Ranking Rules</p>
                  {tile.ranking_rules.length === 0 && <p className="text-white/20 text-xs" style={I}>None</p>}
                  {tile.ranking_rules.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 border border-white/10 px-3 py-2">
                      <div>
                        <span className="text-white text-xs font-mono">{r.signal_key}</span>
                        <span className="text-white/40 text-xs ml-2" style={I}>weight: {r.weight} - p{r.priority}</span>
                      </div>
                      <button onClick={() => handleDeleteRule(r.id, "ranking")} className="text-white/20 text-xs hover:text-red-400 transition-colors">X</button>
                    </div>
                  ))}
                </div>

                <div className="border border-white/10 p-3 space-y-2">
                  <p className="text-white/40 text-[9px] tracking-widest uppercase" style={G}>Add Rule</p>
                  <div className="flex gap-2">
                    {(["eligibility", "ranking"] as const).map((t) => (
                      <button key={t} onClick={() => setAddRuleType(t)}
                        className={`flex-1 py-1.5 text-[9px] tracking-widest uppercase border transition-colors ${addRuleType === t ? "border-brand-green text-brand-green" : "border-white/15 text-white/30"}`} style={G}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <select className="flex-1 bg-[#111] border border-white/20 text-white text-xs px-2 py-1.5 outline-none" style={I}
                      value={newRuleKey}
                      onChange={(e) => setNewRuleKey(e.target.value)}>
                      {(addRuleType === "eligibility" ? ELIGIBILITY_KEYS : RANKING_KEYS).map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                    {addRuleType === "eligibility" && (
                      <select className="bg-[#111] border border-white/20 text-white text-xs px-2 py-1.5 outline-none" style={I}
                        value={newRuleMode}
                        onChange={(e) => setNewRuleMode(e.target.value as "mandatory" | "notify_only")}>
                        <option value="mandatory">mandatory</option>
                        <option value="notify_only">notify_only</option>
                      </select>
                    )}
                    <input placeholder={addRuleType === "eligibility" ? "value" : "weight"}
                      className="w-20 bg-transparent border border-white/20 text-white placeholder-white/20 px-2 py-1.5 text-xs outline-none focus:border-brand-green transition-colors" style={I}
                      value={newRuleValue}
                      onChange={(e) => setNewRuleValue(e.target.value)} />
                    <button onClick={handleAddRule} disabled={isPending}
                      className="bg-brand-green text-black px-3 py-1.5 text-[9px] tracking-widest uppercase font-bold disabled:opacity-40" style={G}>
                      Add
                    </button>
                  </div>
                  {ruleError && <p className="text-red-400 text-[10px]" style={I}>{ruleError}</p>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Hidden file input shared across all tiles */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const tileId = imageInputRef.current?.dataset.tile;
          if (file && tileId) handleImageUpload(tileId, file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
