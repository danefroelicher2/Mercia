import { SupabaseClient } from '@supabase/supabase-js';
import { Chat, StorageAdapter, LLMAdapter } from '@mercia/ai-core';

// "Daily Outlook" persists through the day it's opened — swiping out of the
// app or switching tabs shouldn't lose the conversation — but wipes clean at
// midnight so tomorrow starts fresh. Rather than a dedicated "chat kind"
// column, a chat is considered "today's" simply if it has the right title and
// was created within today's local calendar day; the next calendar day, no
// match is found and a new one gets created.
//
// "Day in Review" deliberately does NOT use this lookup (see alwaysCreateNew
// below) — its numbers come from yesterday's task_completion_history, which
// the user can still edit today (the Routine tab lets you toggle a past day
// within the current week), so a cached review could go stale the moment they
// correct something. It always regenerates fresh instead.
async function findExistingChatForToday(
  userId: string,
  title: string,
  todayDateStr: string,
  timezone: string | undefined,
  supabase: SupabaseClient<any>,
  getLocalDateString: (timezone?: string, date?: Date) => string
): Promise<Chat | null> {
  const { data } = await supabase
    .schema('oasis')
    .from('chats')
    .select('*')
    .eq('user_id', userId)
    .eq('title', title)
    .order('created_at', { ascending: false })
    .limit(5);

  const match = (data || []).find(
    (c: any) => getLocalDateString(timezone, new Date(c.created_at)) === todayDateStr
  );
  return (match as Chat) ?? null;
}

interface GetOrCreateDailyChatParams {
  userId: string;
  title: string;
  todayDateStr: string;
  timezone: string | undefined;
  supabase: SupabaseClient<any>;
  storage: StorageAdapter;
  llm: LLMAdapter;
  getLocalDateString: (timezone?: string, date?: Date) => string;
  buildSystemPrompt: () => Promise<string>;
  // When true, skips the existing-chat lookup and always creates a fresh chat
  // with a freshly generated opening message. Used by /day-in-review so it
  // reflects any edits made to yesterday's data since it was last opened,
  // rather than replaying a cached review. /daily-outlook leaves this false.
  alwaysCreateNew?: boolean;
}

// Finds today's existing chat for this title (no LLM call, just loads history
// via the caller re-fetching messages), or creates one and generates its
// opening message. Shared by /daily-outlook and /day-in-review — they differ
// in title, what buildSystemPrompt feeds the LLM, and whether caching applies.
export async function getOrCreateDailyChat({
  userId,
  title,
  todayDateStr,
  timezone,
  supabase,
  storage,
  llm,
  getLocalDateString,
  buildSystemPrompt,
  alwaysCreateNew = false,
}: GetOrCreateDailyChatParams): Promise<{ chat: Chat; isNew: boolean }> {
  if (!alwaysCreateNew) {
    const existing = await findExistingChatForToday(userId, title, todayDateStr, timezone, supabase, getLocalDateString);
    if (existing) {
      return { chat: existing, isNew: false };
    }
  }

  const chat = await storage.createChat(userId, title);
  const systemPrompt = await buildSystemPrompt();

  const openingMessage = await llm.chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Open the conversation now.' },
    ],
    { temperature: 0.65, maxTokens: 200 }
  );

  await storage.saveChatMessage(chat.id, userId, 'assistant', openingMessage);

  return { chat, isNew: true };
}
