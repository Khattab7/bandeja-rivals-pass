/**
 * BANDEJA Match Cycle Integration Test
 * ─────────────────────────────────────
 * Tests the full match lifecycle:
 *   create players → create teams → play match → process result →
 *   verify ratings, Bars, streaks, processing summary
 *
 * Usage:
 *   npm run test:cycle              (targets http://localhost:3000 — run "npm run dev" first)
 *   npm run test:cycle:prod         (targets deployed Vercel app)
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INTERNAL_TEST_TOKEN
 */

import { createClient } from '@supabase/supabase-js';
import {
  calculateExpectedScore,
  SCENARIOS as SCORE_SCENARIOS,
} from '../src/lib/bandeja-rating';

// ─── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_TOKEN   = process.env.INTERNAL_TEST_TOKEN;
const APP_URL      = process.env.TEST_APP_URL
  ?? process.env.NEXT_PUBLIC_APP_URL
  ?? 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}
if (!TEST_TOKEN) {
  console.error('✗ Missing INTERNAL_TEST_TOKEN — add it to .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Terminal colours ─────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
};
const bold  = (s: string) => `${C.bold}${s}${C.reset}`;
const dim   = (s: string) => `${C.dim}${s}${C.reset}`;
const green = (s: string) => `${C.green}${s}${C.reset}`;
const red   = (s: string) => `${C.red}${s}${C.reset}`;
const cyan  = (s: string) => `${C.cyan}${s}${C.reset}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TestPlayer {
  authUserId: string;
  profileId:  string;
  side:  'A' | 'B';
  slot:  'player_1' | 'player_2';
}

interface Scenario {
  name:               string;
  teamARatings:       [number, number];   // [player_1, player_2]
  teamBRatings:       [number, number];
  actualScenarioIndex: number;            // 1–14 from the BANDEJA approved scores table
  winningSide:        'A' | 'B';
  expected: {
    // Team-level rating changes
    teamAChange:   number;
    teamBChange:   number;
    // Per-player rating changes (team / 2, round-half-up)
    aPlayerChange: number;
    bPlayerChange: number;
    // Bars per player (barsReward=100 default)
    aBarsPerPlayer: number;
    bBarsPerPlayer: number;
    // Win streak delta from 0 (1 = incremented, 0 = stayed/reset to 0)
    aWinStreak:     0 | 1;
    bWinStreak:     0 | 1;
    // Beat-expected streak delta from 0
    aBeatExpStreak: 0 | 1;
    bBeatExpStreak: 0 | 1;
    // Steps (for summary assertion)
    steps: number;
  };
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────
// Expected values derived from the SPEC, not from the implementation.
// A failing test means the implementation diverges from spec.
const TEST_SCENARIOS: Scenario[] = [
  // ── 1. Balanced teams (Steps=0), A wins 6-4 ─────────────────────────────
  // Spec (Steps=0 table): 6-4 → winner +30 team / -30 loser team
  // Steps=0 special case: winner gets BOTH win-streak AND beat-expected-streak
  {
    name: 'Steps=0 balanced — A wins 6-4',
    teamARatings: [500, 500],
    teamBRatings: [500, 500],
    actualScenarioIndex: 5,   // A wins 6-4
    winningSide: 'A',
    expected: {
      teamAChange: +30, teamBChange: -30,
      aPlayerChange: +15, bPlayerChange: -15,
      aBarsPerPlayer: 50, bBarsPerPlayer: 0,
      aWinStreak: 1, bWinStreak: 0,
      aBeatExpStreak: 1, bBeatExpStreak: 0,
      steps: 0,
    },
  },

  // ── 2. Steps=3 A favored — exact expected score (A wins 6-4) ────────────
  // Expected: (545-515)=30 diff → 3 steps → expected A wins 6-4 (idx 5)
  // Actual = expected → teamChange = 0; Bars split 75/25 (winner/loser)
  // Streak: winner win+1, BOTH beat-exp streaks reset
  {
    name: 'Steps=3 A favored — exact expected (A wins 6-4)',
    teamARatings: [545, 545],
    teamBRatings: [515, 515],
    actualScenarioIndex: 5,   // A wins 6-4 → matches expected
    winningSide: 'A',
    expected: {
      teamAChange: 0, teamBChange: 0,
      aPlayerChange: 0, bPlayerChange: 0,
      aBarsPerPlayer: 37.5, bBarsPerPlayer: 12.5,
      aWinStreak: 1, bWinStreak: 0,
      aBeatExpStreak: 0, bBeatExpStreak: 0,   // both reset on exact expected
      steps: 3,
    },
  },

  // ── 3. Steps=3 A favored — A beats expected (wins 6-2 vs expected 6-4) ──
  // Actual idx=3, expected idx=5 → diff = 3-5 = -2 → teamA +20
  // A wins AND beats expected → A gets winner pool (25) + beat-exp pool (25) = 50
  {
    name: 'Steps=3 A favored — A beats expected (A wins 6-2)',
    teamARatings: [545, 545],
    teamBRatings: [515, 515],
    actualScenarioIndex: 3,   // A wins 6-2
    winningSide: 'A',
    expected: {
      teamAChange: +20, teamBChange: -20,
      aPlayerChange: +10, bPlayerChange: -10,
      aBarsPerPlayer: 50, bBarsPerPlayer: 0,
      aWinStreak: 1, bWinStreak: 0,
      aBeatExpStreak: 1, bBeatExpStreak: 0,
      steps: 3,
    },
  },

  // ── 4. Steps=3 A favored — B pulls upset (B wins 7-6) ───────────────────
  // Actual idx=8, expected idx=5 → diff = 8-5 = +3 → teamA -30, teamB +30
  // B wins AND beats expected → B gets 25+25=50 bars per player; A gets 0
  {
    name: 'Steps=3 A favored — B upset (B wins 7-6)',
    teamARatings: [545, 545],
    teamBRatings: [515, 515],
    actualScenarioIndex: 8,   // B wins 7-6
    winningSide: 'B',
    expected: {
      teamAChange: -30, teamBChange: +30,
      aPlayerChange: -15, bPlayerChange: +15,
      aBarsPerPlayer: 0, bBarsPerPlayer: 50,
      aWinStreak: 0, bWinStreak: 1,
      aBeatExpStreak: 0, bBeatExpStreak: 1,
      steps: 3,
    },
  },

  // ── 5. Steps=3 A favored — A wins narrowly, B earns consolation bars ────
  // Actual idx=7 (A wins 7-6), expected idx=5 (A wins 6-4)
  // diff = 7-5 = +2 → B beat expected (as loser); teamA -20, teamB +20
  // A (winner only): 25 bars per player; B (beat expected only): 25 bars per player
  {
    name: 'Steps=3 A favored — A wins 7-6 (worse), B earns consolation bars',
    teamARatings: [545, 545],
    teamBRatings: [515, 515],
    actualScenarioIndex: 7,   // A wins 7-6
    winningSide: 'A',
    expected: {
      teamAChange: -20, teamBChange: +20,
      aPlayerChange: -10, bPlayerChange: +10,
      aBarsPerPlayer: 25, bBarsPerPlayer: 25,
      aWinStreak: 1, bWinStreak: 0,
      aBeatExpStreak: 0, bBeatExpStreak: 1,   // B beat expected as the losing team
      steps: 3,
    },
  },

  // ── 6. Balanced teams (Steps=0), B wins 6-0 (dominant) ──────────────────
  // Spec (Steps=0 table): 6-0 → winner +70 team / -70 loser team
  {
    name: 'Steps=0 balanced — B wins 6-0 (dominant)',
    teamARatings: [500, 500],
    teamBRatings: [500, 500],
    actualScenarioIndex: 14,  // B wins 6-0
    winningSide: 'B',
    expected: {
      teamAChange: -70, teamBChange: +70,
      aPlayerChange: -35, bPlayerChange: +35,
      aBarsPerPlayer: 0, bBarsPerPlayer: 50,
      aWinStreak: 0, bWinStreak: 1,
      aBeatExpStreak: 0, bBeatExpStreak: 1,
      steps: 0,
    },
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreLabel(idx: number): string {
  const s = SCORE_SCENARIOS.find((s) => s.index === idx);
  return s ? `${s.winner} wins ${s.label}` : '?';
}

// ─── Fixture setup ────────────────────────────────────────────────────────────
async function createFixtures(runId: string): Promise<{
  players: TestPlayer[];
  teamAId: string;
  teamBId: string;
}> {
  const players: TestPlayer[] = [];
  const configs = [
    { side: 'A' as const, slot: 'player_1' as const },
    { side: 'A' as const, slot: 'player_2' as const },
    { side: 'B' as const, slot: 'player_1' as const },
    { side: 'B' as const, slot: 'player_2' as const },
  ];

  for (let i = 0; i < 4; i++) {
    const email = `test+${runId}-p${i + 1}@bandeja-test.internal`;

    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password: 'BandejaTest_9!',
      email_confirm: true,
    });
    if (authErr || !authData.user) throw new Error(`Auth user ${i + 1}: ${authErr?.message}`);

    const { data: profile, error: profErr } = await db
      .from('player_profiles')
      .insert({
        user_id:              authData.user.id,
        first_name:           `Test${i + 1}`,
        last_name:            'Bot',
        display_name:         `TestBot${i + 1}`,
        username:             `tb${i + 1}${runId.slice(0, 6)}`,
        public_player_id:     `PP-TEST-${runId.slice(0, 8)}-${i + 1}`,
        current_rating:       500,
        starting_rating:      500,
        onboarding_completed: true,
        match_ready:          true,
        city:                 'Cairo',
        country:              'EG',
        leaderboard_city:     'cairo',
      })
      .select('id')
      .single();
    if (profErr || !profile) throw new Error(`Profile ${i + 1}: ${profErr?.message}`);

    await db.from('player_stats').insert({ player_id: profile.id });

    players.push({ authUserId: authData.user.id, profileId: profile.id, ...configs[i] });
  }

  // Create teams
  async function makeTeam(label: string, teamPlayers: TestPlayer[]): Promise<string> {
    const { data: team, error } = await db
      .from('teams')
      .insert({
        name:                       `Test Team ${label}`,
        auto_name:                  `Test Team ${label}`,
        public_team_id:             `BRT-TEST-${label}-${runId.slice(0, 8)}`,
        status:                     'active',
        captain_player_id:          teamPlayers[0].profileId,
        home_city:                  'Cairo',
        pair_key:                   `${teamPlayers[0].profileId}:${teamPlayers[1].profileId}`,
        cached_current_team_rating: 500,
      })
      .select('id')
      .single();
    if (error || !team) throw new Error(`Team ${label}: ${error?.message}`);

    for (const p of teamPlayers) {
      await db.from('team_members').insert({
        team_id:   team.id,
        player_id: p.profileId,
        role:      p.slot === 'player_1' ? 'captain' : 'member',
      });
    }
    await db.from('team_stats').insert({ team_id: team.id });

    return team.id;
  }

  const teamAId = await makeTeam(`Alpha_${runId.slice(0, 4)}`, players.filter((p) => p.side === 'A'));
  const teamBId = await makeTeam(`Beta_${runId.slice(0, 4)}`,  players.filter((p) => p.side === 'B'));

  return { players, teamAId, teamBId };
}

// ─── Scenario runner ──────────────────────────────────────────────────────────
interface ScenarioResult {
  passed:   number;
  failed:   number;
  failures: string[];
}

async function runScenario(
  scenario:  Scenario,
  players:   TestPlayer[],
  teamAId:   string,
  teamBId:   string,
): Promise<ScenarioResult> {
  const aPlayers = players.filter((p) => p.side === 'A');
  const bPlayers = players.filter((p) => p.side === 'B');

  // Set player ratings for this scenario
  for (const p of aPlayers) {
    const r = p.slot === 'player_1' ? scenario.teamARatings[0] : scenario.teamARatings[1];
    await db.from('player_profiles').update({ current_rating: r }).eq('id', p.profileId);
  }
  for (const p of bPlayers) {
    const r = p.slot === 'player_1' ? scenario.teamBRatings[0] : scenario.teamBRatings[1];
    await db.from('player_profiles').update({ current_rating: r }).eq('id', p.profileId);
  }
  // Also update team cached rating
  const teamARating = (scenario.teamARatings[0] + scenario.teamARatings[1]) / 2;
  const teamBRating = (scenario.teamBRatings[0] + scenario.teamBRatings[1]) / 2;
  await db.from('teams').update({ cached_current_team_rating: Math.round(teamARating) }).eq('id', teamAId);
  await db.from('teams').update({ cached_current_team_rating: Math.round(teamBRating) }).eq('id', teamBId);

  // Build rating snapshot (frozen at score submission time)
  const expScore = calculateExpectedScore(teamARating, teamBRating);
  const ratingSnapshot = {
    team_a_rating:          teamARating,
    team_b_rating:          teamBRating,
    steps:                  expScore.steps,
    expected_scenario_index: expScore.expectedScenarioIndex,
    favored_side:           expScore.favoredSide,
    algorithm_version:      '1.0',
    players: [
      ...aPlayers.map((p) => ({
        player_id: p.profileId,
        side: 'A',
        slot: p.slot,
        rating: p.slot === 'player_1' ? scenario.teamARatings[0] : scenario.teamARatings[1],
      })),
      ...bPlayers.map((p) => ({
        player_id: p.profileId,
        side: 'B',
        slot: p.slot,
        rating: p.slot === 'player_1' ? scenario.teamBRatings[0] : scenario.teamBRatings[1],
      })),
    ],
  };

  const submissionTime = new Date().toISOString();

  // Create match
  const { data: match, error: matchErr } = await db
    .from('matches')
    .insert({
      match_type:                       'rivals_rated',
      status:                           'auto_approved',
      source_type:                      'team_challenge',
      team_a_id:                        teamAId,
      team_b_id:                        teamBId,
      city:                             'Cairo',
      rating_snapshot_json:             ratingSnapshot,
      first_score_submitted_at:         submissionTime,
      score_submission_window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (matchErr || !match) throw new Error(`Match insert: ${matchErr?.message}`);

  // match_players
  for (const p of players) {
    const rating = p.side === 'A'
      ? (p.slot === 'player_1' ? scenario.teamARatings[0] : scenario.teamARatings[1])
      : (p.slot === 'player_1' ? scenario.teamBRatings[0] : scenario.teamBRatings[1]);
    await db.from('match_players').insert({
      match_id:                        match.id,
      team_id:                         p.side === 'A' ? teamAId : teamBId,
      player_id:                       p.profileId,
      side:                            p.side,
      slot:                            p.slot,
      player_rating_at_match_creation: rating,
    });
  }

  // Score submission
  const { error: subErr } = await db.from('match_score_submissions').insert({
    match_id:                              match.id,
    submitted_by_player_id:               aPlayers[0].profileId,
    submitted_by_team_id:                 teamAId,
    submission_type:                      'original',
    score_format:                         'one_set',
    equivalent_actual_score_scenario_index: scenario.actualScenarioIndex,
    equivalent_actual_score_label:         scoreLabel(scenario.actualScenarioIndex).split(' wins ')[1] ?? '?',
    winning_side:                         scenario.winningSide,
    status:                               'pending',
  });
  if (subErr) throw new Error(`Submission insert: ${subErr.message}`);

  // ── Trigger processing via internal endpoint ──────────────────────────────
  const resp = await fetch(`${APP_URL}/api/internal/process-match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-token': TEST_TOKEN!,
    },
    body: JSON.stringify({ matchId: match.id }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Process endpoint ${resp.status}: ${body.slice(0, 200)}`);
  }
  const processResult = await resp.json() as { error?: string };
  if (processResult.error) throw new Error(`Processing: ${processResult.error}`);

  // ── Read back DB state ────────────────────────────────────────────────────
  const playerIds = players.map((p) => p.profileId);

  const [profilesResult, barsResult, statsResult, summaryResult, matchStatusResult] =
    await Promise.all([
      db.from('player_profiles').select('id, current_rating').in('id', playerIds),
      db.from('bars_ledger').select('player_id, amount, status').in('player_id', playerIds).eq('match_id', match.id),
      db.from('player_stats')
        .select('player_id, wins, losses, current_winning_streak, current_beat_expected_streak')
        .in('player_id', playerIds),
      db.from('match_processing_summaries')
        .select('steps, team_a_rating_change, team_b_rating_change, actual_scenario_index, favored_side')
        .eq('match_id', match.id)
        .maybeSingle(),
      db.from('matches').select('status').eq('id', match.id).single(),
    ]);

  const ratingById: Record<string, number> = {};
  for (const r of profilesResult.data ?? []) ratingById[r.id] = r.current_rating;

  const barsById: Record<string, number> = {};
  for (const p of playerIds) {
    barsById[p] = (barsResult.data ?? [])
      .filter((b) => b.player_id === p)
      .reduce((sum, b) => sum + Number(b.amount), 0);
  }

  const statsById: Record<string, { current_winning_streak: number; current_beat_expected_streak: number }> = {};
  for (const s of statsResult.data ?? []) statsById[s.player_id] = s;

  const summary = summaryResult.data;
  const matchStatus = matchStatusResult.data?.status;

  // ── Assertions ────────────────────────────────────────────────────────────
  const passed: string[] = [];
  const failures: string[] = [];

  function check(label: string, expected: number | string | null, actual: number | string | null | undefined) {
    const exp = typeof expected === 'number' ? Number(expected.toFixed(1)) : expected;
    const act = typeof actual   === 'number' ? Number(actual.toFixed(1))  : actual;
    if (exp === act) {
      passed.push(label);
      console.log(`    ${green('✓')} ${label}`);
    } else {
      failures.push(`${label} — expected ${exp}, got ${act}`);
      console.log(`    ${red('✗')} ${label}`);
      console.log(`      ${dim(`expected: ${exp}`)}`);
      console.log(`      ${dim(`actual:   ${act}`)}`);
    }
  }

  console.log('');
  console.log('  Rating changes:');
  for (const p of aPlayers) {
    const initial = p.slot === 'player_1' ? scenario.teamARatings[0] : scenario.teamARatings[1];
    check(`  A ${p.slot} rating Δ`, scenario.expected.aPlayerChange, (ratingById[p.profileId] ?? initial) - initial);
  }
  for (const p of bPlayers) {
    const initial = p.slot === 'player_1' ? scenario.teamBRatings[0] : scenario.teamBRatings[1];
    check(`  B ${p.slot} rating Δ`, scenario.expected.bPlayerChange, (ratingById[p.profileId] ?? initial) - initial);
  }

  console.log('  Bars per player:');
  for (const p of aPlayers) check(`  A ${p.slot} bars`, scenario.expected.aBarsPerPlayer, barsById[p.profileId] ?? 0);
  for (const p of bPlayers) check(`  B ${p.slot} bars`, scenario.expected.bBarsPerPlayer, barsById[p.profileId] ?? 0);

  console.log('  Streaks:');
  for (const p of aPlayers) {
    check(`  A ${p.slot} win streak`,      scenario.expected.aWinStreak,     statsById[p.profileId]?.current_winning_streak     ?? 0);
    check(`  A ${p.slot} beat-exp streak`, scenario.expected.aBeatExpStreak, statsById[p.profileId]?.current_beat_expected_streak ?? 0);
  }
  for (const p of bPlayers) {
    check(`  B ${p.slot} win streak`,      scenario.expected.bWinStreak,     statsById[p.profileId]?.current_winning_streak     ?? 0);
    check(`  B ${p.slot} beat-exp streak`, scenario.expected.bBeatExpStreak, statsById[p.profileId]?.current_beat_expected_streak ?? 0);
  }

  console.log('  Processing summary:');
  check('  summary.steps',         scenario.expected.steps,       summary?.steps ?? null);
  check('  summary.teamAChange',   scenario.expected.teamAChange, summary?.team_a_rating_change ?? null);
  check('  summary.teamBChange',   scenario.expected.teamBChange, summary?.team_b_rating_change ?? null);
  check('  summary.scenarioIndex', scenario.actualScenarioIndex,  summary?.actual_scenario_index ?? null);
  check('  match.status',          'processed',                   matchStatus ?? null);

  // ── Per-scenario cleanup ──────────────────────────────────────────────────
  // Delete all artifacts so the next scenario starts clean
  await Promise.all([
    db.from('bars_ledger').delete().in('player_id', playerIds),
    db.from('rating_events').delete().in('player_id', playerIds),
    db.from('team_rating_snapshots').delete().in('team_id', [teamAId, teamBId]),
  ]);
  // Cascade delete of match also removes match_players, score_submissions, processing_summary
  await db.from('matches').delete().eq('id', match.id);

  // Reset player ratings and stats to baseline
  await Promise.all([
    ...aPlayers.map((p) => db.from('player_profiles').update({ current_rating: 500 }).eq('id', p.profileId)),
    ...bPlayers.map((p) => db.from('player_profiles').update({ current_rating: 500 }).eq('id', p.profileId)),
  ]);
  await db.from('player_stats')
    .update({
      wins: 0, losses: 0, matches_played: 0, rated_matches_played: 0,
      current_winning_streak: 0, best_winning_streak: 0,
      current_beat_expected_streak: 0, best_beat_expected_streak: 0,
      times_beat_expected: 0, upset_wins: 0,
      bars_active_balance: 0, bars_locked_pending: 0,
      bars_total_earned: 0, bars_lifetime_earned: 0,
      highest_rating_ever: null, lowest_rating_ever: null,
      cached_recent_form: '',
    })
    .in('player_id', playerIds);
  await db.from('team_stats')
    .update({
      wins: 0, losses: 0, matches_played: 0, rated_matches: 0, friendly_matches: 0,
      current_win_streak: 0, best_win_streak: 0,
      current_beat_expected_streak: 0, best_beat_expected_streak: 0,
      times_beat_expected: 0, upset_wins: 0,
      bars_earned_as_team: 0, cached_recent_form: '',
    })
    .in('team_id', [teamAId, teamBId]);
  await Promise.all([
    db.from('teams').update({ cached_current_team_rating: 500 }).eq('id', teamAId),
    db.from('teams').update({ cached_current_team_rating: 500 }).eq('id', teamBId),
  ]);

  return { passed: passed.length, failed: failures.length, failures };
}

// ─── Final fixture teardown ───────────────────────────────────────────────────
async function teardown(players: TestPlayer[], teamAId: string, teamBId: string) {
  const playerIds = players.map((p) => p.profileId);
  const teamIds   = [teamAId, teamBId].filter(Boolean);

  // Clean up any leftover artifacts from failed scenarios
  await Promise.all([
    db.from('bars_ledger').delete().in('player_id', playerIds),
    db.from('rating_events').delete().in('player_id', playerIds),
  ]);
  if (teamIds.length) {
    await db.from('team_stats').delete().in('team_id', teamIds);
    await db.from('team_members').delete().in('team_id', teamIds);
    await db.from('teams').delete().in('id', teamIds);
  }
  await db.from('player_stats').delete().in('player_id', playerIds);
  await db.from('player_profiles').delete().in('id', playerIds);
  for (const p of players) {
    await db.auth.admin.deleteUser(p.authUserId);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const runId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  console.log(bold('\n╔══════════════════════════════════════════════════════════╗'));
  console.log(bold('║     BANDEJA Match Cycle Integration Test Runner          ║'));
  console.log(bold('╚══════════════════════════════════════════════════════════╝\n'));
  console.log(`  ${cyan('App URL:')} ${APP_URL}`);
  console.log(`  ${cyan('Run ID:')}  ${runId}\n`);

  // Verify connectivity + endpoint before creating any data
  try {
    const ping = await fetch(`${APP_URL}/api/internal/process-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': TEST_TOKEN! },
      body: JSON.stringify({ matchId: 'ping' }),
    });
    if (ping.status === 403) {
      throw new Error('Token rejected (403) — INTERNAL_TEST_TOKEN mismatch between script and app');
    }
    // 400 ("Missing matchId") means we connected successfully
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch failed')) {
      console.error(red(`  ✗ Cannot reach ${APP_URL}`));
      console.error(red('    Is the dev server running?  →  npm run dev'));
    } else {
      console.error(red(`  ✗ Endpoint check failed: ${e.message}`));
    }
    process.exit(1);
  }
  console.log(`  ${green('✓')} Endpoint reachable\n`);

  // Create fixtures
  process.stdout.write('Creating test fixtures...');
  let players: TestPlayer[] = [];
  let teamAId = '';
  let teamBId = '';
  try {
    const fixtures = await createFixtures(runId);
    players = fixtures.players;
    teamAId = fixtures.teamAId;
    teamBId = fixtures.teamBId;
    console.log(green(' ✓'));
    console.log(`  ${dim('4 players + 2 teams created (will be deleted after run)')}\n`);
  } catch (e: any) {
    console.log(red(' ✗'));
    console.error(red(`  Fixture setup failed: ${e.message}`));
    if (players.length) await teardown(players, teamAId, teamBId).catch(() => {});
    process.exit(1);
  }

  // Run each scenario
  const results: Array<{ name: string } & ScenarioResult> = [];

  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const scenario = TEST_SCENARIOS[i];
    const sep = '─'.repeat(62);
    console.log(cyan(sep));
    const tA = `(${scenario.teamARatings[0]}+${scenario.teamARatings[1]})/2=${(scenario.teamARatings[0] + scenario.teamARatings[1]) / 2}`;
    const tB = `(${scenario.teamBRatings[0]}+${scenario.teamBRatings[1]})/2=${(scenario.teamBRatings[0] + scenario.teamBRatings[1]) / 2}`;
    console.log(bold(`Scenario ${i + 1}/${TEST_SCENARIOS.length}: ${scenario.name}`));
    console.log(dim(`  teamA ${tA}  teamB ${tB}  score: ${scoreLabel(scenario.actualScenarioIndex)}`));

    try {
      const result = await runScenario(scenario, players, teamAId, teamBId);
      results.push({ name: scenario.name, ...result });
      const icon = result.failed === 0
        ? green(`✓ ${result.passed}/${result.passed + result.failed} checks passed`)
        : red(`✗ ${result.failed}/${result.passed + result.failed} checks FAILED`);
      console.log(`\n  ${icon}`);
    } catch (e: any) {
      results.push({ name: scenario.name, passed: 0, failed: 1, failures: [`Scenario crashed: ${e.message}`] });
      console.log(red(`\n  ✗ Scenario crashed: ${e.message}`));
    }
    console.log('');
  }

  // Teardown
  process.stdout.write(cyan('─'.repeat(62)) + '\nCleaning up test data...');
  try {
    await teardown(players, teamAId, teamBId);
    console.log(green(' ✓\n'));
  } catch (e: any) {
    console.log(red(` ✗ (partial — search Supabase for runId ${runId} to remove manually)\n`));
  }

  // Summary
  const totalPassed  = results.reduce((n, r) => n + r.passed,  0);
  const totalFailed  = results.reduce((n, r) => n + r.failed,  0);
  const failedScenarios = results.filter((r) => r.failed > 0);

  console.log(bold('╔══════════════════════════════════════════════════════════╗'));
  console.log(bold('║  FINAL RESULTS                                           ║'));
  console.log(bold('╚══════════════════════════════════════════════════════════╝'));
  console.log(`  Assertions : ${green(String(totalPassed))} passed  ${totalFailed > 0 ? red(String(totalFailed) + ' failed') : '0 failed'}`);
  console.log(`  Scenarios  : ${results.length - failedScenarios.length}/${results.length} fully passed\n`);

  if (failedScenarios.length === 0) {
    console.log(green('  All scenarios passed. Implementation matches spec.\n'));
  } else {
    console.log(red('  FAILURES:'));
    for (const r of failedScenarios) {
      console.log(`  ${bold(r.name)}`);
      for (const f of r.failures) {
        console.log(`    • ${f}`);
      }
    }
    console.log('');
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(red(`\nFatal error: ${e.message}`));
  process.exit(1);
});
