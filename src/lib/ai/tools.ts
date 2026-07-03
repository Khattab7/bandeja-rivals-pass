import type OpenAI from 'openai';

export const PHASE1_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_my_stats',
      description: "Get the current player's full match statistics and performance summary",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_rating_history',
      description: "Get the current player's recent rating changes from matches",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of entries to return (default 5, max 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_bars',
      description: "Get the current player's Bars balance and recent Bars activity",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_open_matches',
      description: 'Browse open match listings available for teams to apply to',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Filter by city name' },
          match_type: {
            type: 'string',
            enum: ['rivals_rated', 'friendly'],
            description: 'Filter by match type',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leaderboard',
      description: 'Get the top-rated players on the leaderboard',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Filter leaderboard by city' },
          limit: { type: 'number', description: 'Number of players to return (default 10, max 10)' },
        },
        required: [],
      },
    },
  },
];
