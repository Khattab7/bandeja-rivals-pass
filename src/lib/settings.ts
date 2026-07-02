import { createClient } from '@/lib/supabase/server';
import type { AppSettingKey } from '@/lib/types';

/**
 * Read a single app setting by key.
 * Returns the typed JS value (parsed from JSONB).
 * Falls back to `defaultValue` if the key doesn't exist.
 */
export async function getSetting<T>(key: AppSettingKey, defaultValue: T): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (data === null) return defaultValue;
  return data.value as T;
}

/**
 * Read multiple settings at once. Returns a map of key → value.
 * Any missing keys fall back to their provided defaults.
 */
export async function getSettings<K extends AppSettingKey>(
  keys: K[],
  defaults: Record<K, unknown>
): Promise<Record<K, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', keys);

  const result = { ...defaults } as Record<K, unknown>;
  if (data) {
    for (const row of data) {
      result[row.key as K] = row.value;
    }
  }
  return result;
}
