export type PartnerBenefit = {
  pct: string;
  label: string;
  sub: string;
};

// Displayed on the /pass page benefits panel
export const PARTNER_BENEFITS: PartnerBenefit[] = [
  { pct: "10%", label: "OFF COURT BOOKINGS", sub: "at partner venues" },
  { pct: "10%", label: "OFF PADEL BALLS & GRIPS", sub: "at partner stores" },
  { pct: "20%", label: "OFF RIVALS MONTHLY FINALE", sub: "registration fee" },
];

// Used by the AI system prompt — keep in sync with product decisions
export const PLATFORM_BENEFITS = [
  "Active Bars earning: Bars from wins, streaks, and quests go straight to your active balance. Free players accumulate locked Bars they cannot use until they upgrade.",
  "Retroactive Bars unlock: upgrading from free unlocks all non-expired locked Bars you earned while free.",
  "Bars redemption: spend active Bars on rewards such as court bookings and gear.",
  "Leaderboard eligibility: appear on city and global leaderboards. Free players are excluded.",
  "Priority matchmaking: your open match posts are boosted and shown first to other players.",
  "Paid quests: access to exclusive member-only quest challenges with active Bars rewards.",
  "Apple Wallet pass: a digital membership card that venue staff can scan at partner courts.",
];
