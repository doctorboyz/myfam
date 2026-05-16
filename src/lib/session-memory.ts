/**
 * In-memory session memory for LINE chat conversations.
 * Stores the last 5 conversation cycles per user to provide context
 * for follow-up questions and multi-turn interactions.
 */

import type { UserIntent } from '@/lib/ollama';

export interface ChatCycle {
  userText: string;
  intent: UserIntent;
  response: string;
  timestamp: number;
}

const sessionMemory = new Map<string, ChatCycle[]>();

export function getSessionMemory(lineUserId: string): ChatCycle[] {
  return sessionMemory.get(lineUserId) ?? [];
}

export function addCycle(lineUserId: string, cycle: ChatCycle): void {
  const history = getSessionMemory(lineUserId);
  history.push(cycle);
  if (history.length > 5) {
    history.shift();
  }
  sessionMemory.set(lineUserId, history);
}

export function formatSessionContext(lineUserId: string): string {
  const history = getSessionMemory(lineUserId);
  if (history.length === 0) return '';

  return history
    .map(
      (c, i) =>
        `[${i + 1}] User: "${c.userText}"\n    Bot (intent: ${c.intent}): "${c.response}"`,
    )
    .join('\n');
}
