import { createClient } from '@supabase/supabase-js';
import { mockBatch, mockProgress, mockProposal } from '../lib/mock-data';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon || url.includes('<<') || anon.includes('<<')) {
  console.log('Mock-only: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to insert seed rows.');
  process.exit(0);
}
const supabase = createClient(url, anon);
async function main() {
  console.log('Inserting mock batch/progress/proposal with anon auth. This requires RLS policies allowing the current authenticated user or local dev.');
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) console.log('No logged-in user in this script context; insert may fail under RLS.');
  const batch = await supabase.from('batches').upsert({ ...mockBatch, created_by: user.user?.id || mockBatch.id }).select().single();
  console.log('batch', batch.error?.message || batch.data?.id);
  for (const ev of mockProgress) {
    const { error } = await supabase.from('progress_events').insert(ev);
    console.log('event', ev.seq, error?.message || 'ok');
  }
  const { error } = await supabase.from('proposals').insert(mockProposal);
  console.log('proposal', error?.message || 'ok');
}
main();
