// Brain factory. A bot whose model is 'mock', or any bot when `mock` is set or no key is
// loaded, gets a scripted mind; every other bot is asked through OpenRouter.

import { createMockBrain } from './mock.js';

export async function createBrain(bot, env = {}) {
  const mock = env.mock || !env.apiKey || !bot.model || bot.model === 'mock';
  if (mock) return createMockBrain(bot, { seed: env.seed || 1 });
  const { createLlmBrain } = await import('./llm.js');
  return createLlmBrain(bot, env);
}
