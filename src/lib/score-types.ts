export const VALID_SCORES: Array<{ winnerGames: number; loserGames: number; label: string }> = [
  { winnerGames: 6, loserGames: 0, label: '6-0' },
  { winnerGames: 6, loserGames: 1, label: '6-1' },
  { winnerGames: 6, loserGames: 2, label: '6-2' },
  { winnerGames: 6, loserGames: 3, label: '6-3' },
  { winnerGames: 6, loserGames: 4, label: '6-4' },
  { winnerGames: 7, loserGames: 5, label: '7-5' },
  { winnerGames: 7, loserGames: 6, label: '7-6' },
];

export interface SetInput {
  winnerSide: 'my_team' | 'opponent';
  winnerGames: number;
  loserGames: number;
}
