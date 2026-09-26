import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { getSupabase } from './supabase';

const expo = new Expo();

// ============================================================
// sendPush — send a push notification to a single user
// ============================================================
export async function sendPush(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { data: tokenRows, error } = await supabase
    .schema('oasis')
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error) {
    console.error(`[PUSH] Failed to fetch token for user ${userId}:`, error);
    return;
  }

  if (!tokenRows || tokenRows.length === 0) {
    console.log(`[PUSH] No push token for user ${userId} — skipping`);
    return;
  }

  const messages: ExpoPushMessage[] = tokenRows
    .map((row: any) => row.token as string)
    .filter((token) => Expo.isExpoPushToken(token))
    // An empty title shows just the app name and the message (iOS style).
    .map((token) => ({ to: token, ...(title ? { title } : {}), body, data: data ?? {}, sound: 'default' as const }));

  if (messages.length === 0) {
    console.log(`[PUSH] No valid Expo tokens for user ${userId}`);
    return;
  }

  await sendMessages(messages, userId);
}

// ============================================================
// sendBulkPush — send the same notification to many users
// ============================================================
export async function sendBulkPush(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (userIds.length === 0) return;

  const supabase = getSupabase();

  const { data: tokenRows, error } = await supabase
    .schema('oasis')
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', userIds);

  if (error) {
    console.error('[PUSH] Failed to fetch tokens for bulk send:', error);
    return;
  }

  if (!tokenRows || tokenRows.length === 0) {
    console.log('[PUSH] No push tokens found for bulk send');
    return;
  }

  const messages: ExpoPushMessage[] = tokenRows
    .filter((row: any) => Expo.isExpoPushToken(row.token))
    .map((row: any) => ({
      to: row.token as string,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
    }));

  if (messages.length === 0) return;

  console.log(`[PUSH] Sending bulk push to ${messages.length} devices`);
  await sendMessages(messages);
}

// ============================================================
// Internal — chunk and send, handle DeviceNotRegistered
// ============================================================
async function sendMessages(messages: ExpoPushMessage[], userId?: string): Promise<void> {
  const supabase = getSupabase();
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      // Collect stale tokens from DeviceNotRegistered errors, then bulk delete
      const staleTokens: string[] = [];
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error') {
          const details = (ticket as any).details;
          if (details?.error === 'DeviceNotRegistered') {
            staleTokens.push((chunk[i] as any).to as string);
          } else {
            console.error(`[PUSH] Ticket error:`, ticket);
          }
        }
      }
      if (staleTokens.length > 0) {
        console.log(`[PUSH] Removing ${staleTokens.length} stale token(s)`);
        await supabase
          .schema('oasis')
          .from('push_tokens')
          .delete()
          .in('token', staleTokens);
      }
    } catch (err) {
      console.error('[PUSH] Failed to send chunk:', err);
    }
  }
}
