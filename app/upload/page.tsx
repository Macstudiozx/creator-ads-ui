'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { mockAccounts, mockBatch } from '@/lib/mock-data';
import type { Account } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function batchCode() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `B-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}
function adCodeFromName(name: string) { return name.match(/AD\d{3,}/i)?.[0]?.toUpperCase() || name.replace(/\.[^.]+$/, '').slice(0, 24); }
function ext(name: string) { return name.split('.').pop() || 'bin'; }

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, supabaseReady } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>(mockAccounts);
  const [brand, setBrand] = useState(mockAccounts[0].brand);
  const [promo, setPromo] = useState('7.7');
  const [tone, setTone] = useState('อบอุ่น·น่าเชื่อถือ');
  const [files, setFiles] = useState<File[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const code = useMemo(batchCode, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.from('accounts').select('*').eq('active', true).then(({ data }) => { if (data?.length) setAccounts(data as Account[]); });
  }, []);

  async function upload() {
    if (!files.length) { setLog(['เลือกไฟล์ก่อน']); return; }
    setUploading(true);
    setLog([`เริ่มอัปโหลด ${files.length} ไฟล์…`]);
    try {
      const supabase = createClient();
      if (!supabase) {
        setLog([`Mock upload ${files.length} files`, `สร้าง batch จำลอง ${mockBatch.id}`]);
        router.push(`/batch/${mockBatch.id}`);
        return;
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const createdBy = userData.user?.id || user?.id;
      if (userErr || !createdBy) { setLog([`กรุณา login ก่อน upload${userErr ? ` · ${userErr.message}` : ''}`]); return; }
      const { data: batch, error: batchErr } = await supabase.from('batches').insert({ code, created_by: createdBy, brand, promo, brand_tone: tone, status: 'pending_analysis' }).select('*').single();
      if (batchErr) { setLog([`create batch failed · ${batchErr.message}`]); return; }
      const lines: string[] = [`✓ สร้าง batch ${batch.code || batch.id}`];
      for (const file of files) {
        const ad = adCodeFromName(file.name);
        const path = `${code}/${ad}.${ext(file.name)}`;
        setLog([...lines, `กำลังอัปโหลด ${file.name}…`]);
        const signed = await supabase.storage.from('creative-media').createSignedUploadUrl(path);
        if (signed.error || !signed.data) { lines.push(`signed URL failed: ${file.name} · ${signed.error?.message}`); continue; }
        const up = await supabase.storage.from('creative-media').uploadToSignedUrl(path, signed.data.token, file, { upsert: true });
        if (up.error) { lines.push(`upload failed: ${file.name} · ${up.error.message}`); continue; }
        const item = await supabase.from('batch_items').insert({ batch_id: batch.id, ad_code_input: ad, media_path: path, match_status: 'matched' });
        lines.push(item.error ? `insert item failed: ${file.name} · ${item.error.message}` : `✓ ${path}`);
      }
      setLog([...lines, 'สั่ง Python engine ให้เริ่มวิเคราะห์แล้ว…', 'กำลังเปิดหน้า AI วิเคราะห์…']);
      fetch('/api/engine/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.id }),
      }).catch(() => {
        // The scanning page has a fallback message if the backend trigger fails.
      });
      router.push(`/batch/${batch.id}`);
    } catch (err:any) {
      setLog([`upload crashed · ${err?.message || String(err)}`]);
    } finally {
      setUploading(false);
    }
  }

  return <>
    <div className="stepper">
      <div className="stp now"><span className="d">1</span><span className="t">อัปโหลดสื่อ<small>ทั้งชุดในครั้งเดียว</small></span></div><div className="scon" />
      <div className="stp"><span className="d">2</span><span className="t">AI วิเคราะห์<small>funnel · กลุ่ม · งบ · แคปชั่น</small></span></div><div className="scon" />
      <div className="stp"><span className="d">3</span><span className="t">ตรวจ & อนุมัติทีเดียว<small>ใบสรุปแผนชุดเดียว</small></span></div>
    </div>
    <div className="stage">
      <button className="updrop shad-dropzone" onClick={() => inputRef.current?.click()} onDrop={(e) => { e.preventDefault(); setFiles([...e.dataTransfer.files]); }} onDragOver={(e) => e.preventDefault()}>
        <span className="big">⇪</span><b>วางไฟล์ทั้งชุดที่นี่ — กี่ไฟล์ก็ได้</b>
        <small>วิดีโอ · รูป · carousel — upload ตรงเข้า Supabase Storage bucket creative-media ด้วย signed URL</small>
        <Badge variant={files.length ? 'success' : 'secondary'}>{files.length ? `เลือกแล้ว ${files.length} ไฟล์` : 'เลือกไฟล์'}</Badge>
      </button>
      <input ref={inputRef} className="hidden-file" type="file" multiple onChange={e => setFiles(Array.from(e.target.files || []))} />
      <div className="ctxrow">
        <label className="ctx"><small>แบรนด์</small><select value={brand} onChange={e => setBrand(e.target.value)}>{[...new Set(accounts.map(a => a.brand))].map(b => <option key={b}>{b}</option>)}</select></label>
        <label className="ctx"><small>แคมเปญโปร</small><input value={promo} onChange={e => setPromo(e.target.value)} /></label>
        <label className="ctx"><small>โทนแบรนด์</small><input value={tone} onChange={e => setTone(e.target.value)} /></label>
      </div>
      <div className="ctxnote">Mock mode ทำงานได้เมื่อยังไม่มี env จริง · Supabase mode จะ insert batches + batch_items ตาม spec</div>
      <div className="approve-bar"><Button className="ui-button-big" onClick={upload} disabled={uploading}>{uploading ? 'กำลังอัปโหลด…' : 'เริ่มอัปโหลดและส่งเข้า AI วิเคราะห์'}<small>{supabaseReady ? 'Supabase direct upload' : 'Mock mode'}</small></Button></div>
      {log.length > 0 && <div className="feed" style={{marginTop:16}}>{log.map((l,i)=><div className="ln" key={i}>{l}</div>)}</div>}
    </div>
  </>;
}
