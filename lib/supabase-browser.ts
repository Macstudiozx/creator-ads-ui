'use client';

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const hasSupabaseEnv = Boolean(url && anon && !url.includes('<<') && !anon.includes('<<'));

export function createClient() {
  if (!hasSupabaseEnv) return null;
  return createBrowserClient(url, anon);
}
