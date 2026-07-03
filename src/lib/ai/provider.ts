import OpenAI from 'openai';

export function createAiClient() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY!,
    baseURL: 'https://api.deepseek.com',
  });
}

export const AI_MODEL = 'deepseek-chat';
