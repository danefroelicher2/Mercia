import { CronJob } from 'cron';
import { randomUUID } from 'crypto';
import { getLLM, getMemoryManager } from '../services/merciaCore';
import { getSupabase } from '../services/supabase';
import { InsightMetadataEntry } from '@mercia/ai-core';

// ============================================
// MEMORY CONDENSATION JOB
// Runs at 3:00 AM ET every 4 days.
// Loads each user's committed insights_metadata,
// calls LLM to identify redundancies/duplicates,
// applies safe changes, rebuilds flat fields.
// Exits cleanly if nothing to condense.
// ============================================

const MIN_CONFIDENCE = 0.75;
const MAX_SOURCE_COUNT_TO_TOUCH = 2; // never touch entries seen 3+ times
const MAX_CHANGES_PER_RUN = 10;
const MIN_ENTRIES_TO_PROCESS = 5; // skip users with very sparse profiles

const COMMITTED_CATEGORIES = ['value', 'belief', 'interest', 'pattern', 'goal'];

interface ProposedChange {
  action: 'remove' | 'merge';
  primary_id: string;
  redundant_id: string;
  merged_content?: string;
  reason: string;
  confidence: number;
}

export interface CondensationResult {
  entriesBefore: number;
  entriesAfter: number;
  condensed: number;
}

export function startMemoryCondensationJob(): CronJob {
  const job = new CronJob(
    '0 3 * * 1,4',
    async () => {
      console.log('\n[CONDENSATION] ========================================');
      console.log('[CONDENSATION] Starting memory condensation job');
      console.log('[CONDENSATION] ========================================\n');
      try {
        await runMemoryCondensationJob();
      } catch (error) {
        console.error('[CONDENSATION] Unhandled error:', error);
      }
    },
    null,
    true,
    'America/New_York'
  );

  console.log('[CRON] Memory condensation job scheduled (3:00 AM ET, Mon & Thu)');
  return job;
}

export async function runMemoryCondensationJob(): Promise<{ usersProcessed: number; totalCondensed: number }> {
  const supabase = getSupabase();

  const { data: userRows, error } = await supabase
    .schema('oasis')
    .from('user_memory_profiles')
    .select('user_id');

  if (error || !userRows) {
    console.error('[CONDENSATION] Failed to fetch users:', error);
    return { usersProcessed: 0, totalCondensed: 0 };
  }

  let totalCondensed = 0;

  for (const { user_id } of userRows) {
    try {
      const result = await runCondensationForUser(user_id);
      if (result.condensed > 0) {
        console.log(
          `[CONDENSATION] User ${user_id}: ${result.entriesBefore} → ${result.entriesAfter} (−${result.condensed})`
        );
      }
      totalCondensed += result.condensed;
    } catch (err) {
      console.error(`[CONDENSATION] Failed for user ${user_id}:`, err);
    }
  }

  console.log(`[CONDENSATION] Done — ${userRows.length} users processed, ${totalCondensed} total entries condensed`);
  return { usersProcessed: userRows.length, totalCondensed };
}

export async function runCondensationForUser(userId: string): Promise<CondensationResult> {
  const supabase = getSupabase();

  // Load current profile metadata
  const { data: profile, error } = await supabase
    .schema('oasis')
    .from('user_memory_profiles')
    .select('insights_metadata')
    .eq('user_id', userId)
    .single();

  if (error || !profile) {
    return { entriesBefore: 0, entriesAfter: 0, condensed: 0 };
  }

  const allMetadata: InsightMetadataEntry[] = profile.insights_metadata || [];

  // Only work on committed categories — leave conversation_theme and pending alone
  const committed = allMetadata.filter(e => COMMITTED_CATEGORIES.includes(e.category));

  if (committed.length < MIN_ENTRIES_TO_PROCESS) {
    return { entriesBefore: committed.length, entriesAfter: committed.length, condensed: 0 };
  }

  // Build entry list for LLM — include id, category, source_count, content
  const entriesList = committed
    .map(e => `id:${e.id} | cat:${e.category} | seen:${e.source_count || 1} | "${e.content}"`)
    .join('\n');

  const systemPrompt = `You are auditing a user's AI memory profile for redundancy. Identify entries that duplicate or fully subsume another entry.

CONSERVATIVE RULES — read carefully:
1. Only flag two entries as redundant if removing one loses ZERO unique information.
2. Cross-category: a belief about X and an interest in X serve different purposes. A belief describes HOW they think; an interest describes WHAT they engage with. Only flag cross-category if one is a strict weaker restatement of the other (e.g., belief "finance: prefers frugality over lifestyle spending" makes a bare interest "finance" redundant — the interest adds nothing new).
3. Within-category: two phrases expressing the same idea differently → propose a merge with a single richer phrase.
4. NEVER flag entries with seen >= 3. These are strongly validated.
5. Be conservative. When uncertain, do NOT flag. Keeping a mild redundancy is safer than losing a genuine insight.
6. Return at most 10 proposed changes, highest confidence first.

Return ONLY valid JSON (no markdown):
{
  "proposed_changes": [
    {
      "action": "remove" | "merge",
      "primary_id": "uuid — entry to keep, or base for merge",
      "redundant_id": "uuid — entry to remove",
      "merged_content": "only if merge — combined phrase under 20 words",
      "reason": "one sentence",
      "confidence": 0.0-1.0
    }
  ]
}

If no redundancies found, return: {"proposed_changes":[]}`;

  const llm = getLLM();
  let proposed: ProposedChange[] = [];

  try {
    const raw = await llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Memory entries:\n${entriesList}` },
      ],
      { temperature: 0.1, maxTokens: 800 }
    );
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    proposed = JSON.parse(cleaned).proposed_changes || [];
  } catch (err) {
    console.error(`[CONDENSATION] LLM/parse error for user ${userId}:`, err);
    return { entriesBefore: committed.length, entriesAfter: committed.length, condensed: 0 };
  }

  if (proposed.length === 0) {
    return { entriesBefore: committed.length, entriesAfter: committed.length, condensed: 0 };
  }

  // Apply safety filters
  const safe = proposed
    .filter(change => {
      if (change.confidence < MIN_CONFIDENCE) return false;
      const primary = committed.find(e => e.id === change.primary_id);
      const redundant = committed.find(e => e.id === change.redundant_id);
      if (!primary || !redundant) return false;
      if ((redundant.source_count || 1) > MAX_SOURCE_COUNT_TO_TOUCH) return false;
      if (change.action === 'merge' && !change.merged_content?.trim()) return false;
      return true;
    })
    .slice(0, MAX_CHANGES_PER_RUN);

  if (safe.length === 0) {
    return { entriesBefore: committed.length, entriesAfter: committed.length, condensed: 0 };
  }

  // Build updated metadata
  const idsToRemove = new Set<string>();
  const entriesToAdd: InsightMetadataEntry[] = [];
  const now = new Date().toISOString();

  for (const change of safe) {
    const primary = committed.find(e => e.id === change.primary_id)!;
    const redundant = committed.find(e => e.id === change.redundant_id)!;

    if (change.action === 'remove') {
      idsToRemove.add(change.redundant_id);
      console.log(`[CONDENSATION] REMOVE [${redundant.category}] "${redundant.content}" — ${change.reason}`);
    } else {
      // merge: remove both, add one combined entry
      idsToRemove.add(change.primary_id);
      idsToRemove.add(change.redundant_id);
      entriesToAdd.push({
        id: randomUUID(),
        content: change.merged_content!.trim(),
        category: primary.category,
        source_type: primary.source_type,
        source_id: primary.source_id, // provenance from primary only — redundant source_id not retained
        confidence: Math.max(primary.confidence || 0.7, redundant.confidence || 0.7),
        semantic_importance: Math.max(primary.semantic_importance || 0.7, redundant.semantic_importance || 0.7),
        source_count: Math.max(primary.source_count || 1, redundant.source_count || 1) + 1,
        first_identified: primary.first_identified < redundant.first_identified
          ? primary.first_identified
          : redundant.first_identified,
        last_reinforced: now,
      });
      console.log(
        `[CONDENSATION] MERGE [${primary.category}] "${primary.content}" + "${redundant.content}" → "${change.merged_content}"`
      );
    }
  }

  const updatedMetadata: InsightMetadataEntry[] = [
    ...allMetadata.filter(e => !idsToRemove.has(e.id)),
    ...entriesToAdd,
  ];

  // Rebuild flat fields so core_values / beliefs / interests stay in sync
  const memoryManager = getMemoryManager();
  const flatFields = memoryManager.rebuildFlatFields(updatedMetadata);

  const updatedCommitted = updatedMetadata.filter(e => COMMITTED_CATEGORIES.includes(e.category));
  const questionCount = updatedMetadata.filter(e => e.source_type === 'question' && COMMITTED_CATEGORIES.includes(e.category)).length;
  const convCount = updatedMetadata.filter(e => e.source_type === 'conversation' && COMMITTED_CATEGORIES.includes(e.category)).length;

  const { error: updateError } = await supabase
    .schema('oasis')
    .from('user_memory_profiles')
    .update({
      insights_metadata: updatedMetadata,
      ...flatFields,
      question_facts_count: questionCount,
      conversation_facts_count: convCount,
      question_facts_completeness: questionCount / 80,
      conversation_facts_completeness: convCount / 60,
      profile_completeness: (questionCount / 80 + convCount / 60) / 2,
      last_updated: now,
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error(`[CONDENSATION] Save failed for user ${userId}:`, updateError);
    return { entriesBefore: committed.length, entriesAfter: committed.length, condensed: 0 };
  }

  const condensed = committed.length - updatedCommitted.length;
  return { entriesBefore: committed.length, entriesAfter: updatedCommitted.length, condensed };
}
