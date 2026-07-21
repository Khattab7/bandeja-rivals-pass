// BANDEJA Rating Algorithm — shared utility for expected score previews and match processing

export const SCENARIOS = [
  { index: 1,  label: '6-0', winner: 'A', winnerGames: 6, loserGames: 0 },
  { index: 2,  label: '6-1', winner: 'A', winnerGames: 6, loserGames: 1 },
  { index: 3,  label: '6-2', winner: 'A', winnerGames: 6, loserGames: 2 },
  { index: 4,  label: '6-3', winner: 'A', winnerGames: 6, loserGames: 3 },
  { index: 5,  label: '6-4', winner: 'A', winnerGames: 6, loserGames: 4 },
  { index: 6,  label: '7-5', winner: 'A', winnerGames: 7, loserGames: 5 },
  { index: 7,  label: '7-6', winner: 'A', winnerGames: 7, loserGames: 6 },
  { index: 8,  label: '7-6', winner: 'B', winnerGames: 7, loserGames: 6 },
  { index: 9,  label: '7-5', winner: 'B', winnerGames: 7, loserGames: 5 },
  { index: 10, label: '6-4', winner: 'B', winnerGames: 6, loserGames: 4 },
  { index: 11, label: '6-3', winner: 'B', winnerGames: 6, loserGames: 3 },
  { index: 12, label: '6-2', winner: 'B', winnerGames: 6, loserGames: 2 },
  { index: 13, label: '6-1', winner: 'B', winnerGames: 6, loserGames: 1 },
  { index: 14, label: '6-0', winner: 'B', winnerGames: 6, loserGames: 0 },
] as const;

// Exact average — may be 0.5 for odd-sum pairs
export function teamRating(p1: number, p2: number): number {
  return (p1 + p2) / 2;
}

// Round half up (not banker's rounding)
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function ratingDifferenceToSteps(ratingDiff: number): number {
  return Math.floor(Math.abs(ratingDiff) / 10 + 0.5);
}

// Steps → expected scenario index (for the HIGHER-rated team)
// Steps=0 → no expected score (null)
const STEPS_TO_SCENARIO_FOR_FAVORITE: Record<number, number> = {
  1: 7,  // wins 7-6
  2: 6,  // wins 7-5
  3: 5,  // wins 6-4
  4: 4,  // wins 6-3
  5: 3,  // wins 6-2
  6: 2,  // wins 6-1
};

export interface ExpectedScoreResult {
  steps: number;
  // null when steps = 0
  expectedScenarioIndex: number | null;
  expectedLabel: string | null;
  // Which team is favored: 'A' | 'B' | null (balanced)
  favoredSide: 'A' | 'B' | null;
}

export function calculateExpectedScore(teamARating: number, teamBRating: number): ExpectedScoreResult {
  const diff = teamARating - teamBRating;
  const steps = ratingDifferenceToSteps(diff);

  if (steps === 0) {
    return { steps: 0, expectedScenarioIndex: null, expectedLabel: null, favoredSide: null };
  }

  const favoredSide = diff > 0 ? 'A' : 'B';
  const capSteps = Math.min(steps, 6);
  const favoriteScenarioIndex = STEPS_TO_SCENARIO_FOR_FAVORITE[capSteps] ?? 1;

  // Adjust scenario index for perspective: the "favorite" scenario table assumes A is favored
  // If B is favored, mirror: A's index 7 → B's scenario is index 8
  let expectedScenarioIndex: number;
  if (favoredSide === 'A') {
    expectedScenarioIndex = favoriteScenarioIndex;
  } else {
    // Mirror: index n from the left becomes 15-n from the right
    expectedScenarioIndex = 15 - favoriteScenarioIndex;
  }

  const scenario = SCENARIOS.find((s) => s.index === expectedScenarioIndex)!;
  const expectedLabel = favoredSide === 'A'
    ? `A wins ${scenario.label}`
    : `B wins ${scenario.label}`;

  return { steps, expectedScenarioIndex, expectedLabel, favoredSide };
}

// For preview cards: plain-language match label
export function matchLabel(steps: number, myTeamIsFavorite: boolean | null): string {
  if (steps === 0 || myTeamIsFavorite === null) return 'Balanced';
  if (myTeamIsFavorite) {
    if (steps >= 5) return 'Heavy Favorite';
    if (steps >= 3) return 'Favorite';
    return 'Slight Favorite';
  } else {
    if (steps >= 5) return 'Big Underdog';
    if (steps >= 3) return 'Underdog';
    return 'Slight Underdog';
  }
}

// For preview cards: expected score shown to the user with "my team" perspective.
// iAmFavored = true → my team is the higher-rated side, false → opponent is favored.
export function expectedScorePreview(steps: number, iAmFavored: boolean | null): string {
  if (steps === 0 || iAmFavored === null) return 'Even match';

  const capSteps = Math.min(steps, 6);
  const scenarioIndex = STEPS_TO_SCENARIO_FOR_FAVORITE[capSteps] ?? 1;
  const scenario = SCENARIOS.find((s) => s.index === scenarioIndex)!;

  if (iAmFavored) {
    return `Expected to beat them ${scenario.label}`;
  } else {
    return `Expected to beat you ${scenario.winnerGames}-${scenario.loserGames}`;
  }
}

// Rating change calculation (Steps > 0)
export function calculateRatingChange(
  actualScenarioIndex: number,
  expectedScenarioIndex: number
): { teamAChange: number; teamBChange: number } {
  const diff = actualScenarioIndex - expectedScenarioIndex;
  return {
    teamAChange: -diff * 10,
    teamBChange: +diff * 10,
  };
}

// Steps = 0 rating changes (based purely on actual score)
const STEPS0_WINNER_GAIN: Record<number, number> = {
  7: 10,   // 7-6
  6: 20,   // 7-5
  5: 30,   // 6-4
  4: 40,   // 6-3
  3: 50,   // 6-2
  2: 60,   // 6-1
  1: 70,   // 6-0
};

export function calculateSteps0RatingChange(scenarioIndex: number): { teamAChange: number; teamBChange: number } {
  const scenario = SCENARIOS.find((s) => s.index === scenarioIndex)!;
  const gain = (7 - scenario.loserGames) * 10;
  if (scenario.winner === 'A') {
    return { teamAChange: gain, teamBChange: -gain };
  } else {
    return { teamAChange: -gain, teamBChange: gain };
  }
}
