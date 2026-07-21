'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { mockProgress } from '@/lib/mock-data';
import type { ProgressEvent } from '@/lib/types';

const tiles = ['t3','t4','t1','t5','t2','t1','t4','t6','t3','t2','t5','t4','t6','t2','t5','t1','t2','t3','t5','t6','t1','t4','t5','t2'];

export default function BatchScanningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [done, setDone] = useState(false);
  const [waitingForEngine, setWaitingForEngine] = useState(false);
  const counts = useMemo(() => events.reduce((acc:any, ev) => { const f = String(ev.payload?.funnel || '').toLowerCase(); if (f) acc[f]=(acc[f]||0)+1; return acc; }, {}), [events]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      let i = 0; const t = setInterval(() => { setEvents(mockProgress.slice(0, ++i)); if (i >= mockProgress.length) { clearInterval(t); setDone(true); setTimeout(() => router.push(`/batch/${id}/review`), 900); } }, 550);
      return () => clearInterval(t);
    }
    const loadServerEvents = async () => {
      try {
        const res = await fetch(`/api/batch/${id}/events`, { cache: 'no-store' });
        const json = await res.json();
        const rows = (json.events || []) as ProgressEvent[];
        if (rows.length) {
          setWaitingForEngine(false);
          setEvents(rows);
          if (rows.some(ev => ev.event === 'batch_done')) {
            setDone(true);
            setTimeout(() => router.push(`/batch/${id}/review`), 900);
          }
        }
      } catch {}
    };
    supabase.from('progress_events').select('*').eq('batch_id', id).order('seq').then(({ data, error }) => {
      const rows = (data || []) as ProgressEvent[];
      setEvents(rows);
      if (rows.some(ev => ev.event === 'batch_done')) {
        setDone(true);
        setTimeout(() => router.push(`/batch/${id}/review`), 900);
      }
      if (error || !rows.length) loadServerEvents();
    });
    const engineTimer = window.setTimeout(() => {
      setEvents(prev => {
        if (!prev.length) setWaitingForEngine(true);
        return prev;
      });
    }, 4000);
    const channel = supabase.channel(`batch:${id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'progress_events', filter: `batch_id=eq.${id}` }, ({ new: ev }) => {
      const pe = ev as ProgressEvent;
      setWaitingForEngine(false);
      setEvents(prev => [...prev, pe]);
      if (pe.event === 'batch_done') { setDone(true); setTimeout(() => router.push(`/batch/${id}/review`), 900); }
    }).subscribe();
    return () => { window.clearTimeout(engineTimer); supabase.removeChannel(channel); };
  }, [id, router]);

  const classified = events.filter(e => e.event === 'classified');
  const progress = Math.min(100, Math.round((classified.length / Math.max(24, classified.length || 1)) * 100));
  return <>
    <div className="stepper"><div className="stp done"><span className="d">✓</span><span className="t">อัปโหลดสื่อ<small>ทั้งชุดในครั้งเดียว</small></span></div><div className="scon done"/><div className="stp now"><span className="d">2</span><span className="t">AI วิเคราะห์<small>Realtime progress_events</small></span></div><div className="scon"/><div className="stp"><span className="d">3</span><span className="t">ตรวจ & อนุมัติทีเดียว<small>ใบสรุปแผนชุดเดียว</small></span></div></div>
    <div className="stage">
      <div className="theater">
        <div className="sth-head"><div className="eye">👁</div><div><h3>{done ? 'จัดกลุ่มเสร็จ ✓' : 'AI กำลังอ่านสื่อทั้งชุด'}</h3><small>batch {id} · subscribe progress_events</small></div><div className="counts"><span className="cnt-chip c">TOF <b>{counts.tof||0}</b></span><span className="cnt-chip w">MOF <b>{counts.mof||0}</b></span><span className="cnt-chip h">BOF <b>{counts.bof||0}</b></span></div></div>
        <div className="sth-body">
          <div className="tilegrid">{tiles.map((t,i) => { const ev = classified[i]; const f = String(ev?.payload?.funnel || '').toLowerCase(); return <div key={i} className={`tile ${t} ${ev ? `done f-${f}` : i===classified.length ? 'scan' : ''}`} data-f={f ? f.toUpperCase() : ''}/>; })}</div>
          <aside className="feed" aria-live="polite">{waitingForEngine && <div className="ln"><b>รอ Python engine…</b> <span className="dim">ยังไม่มี progress_events สำหรับ batch นี้ · upload สำเร็จแล้ว แต่ engine ยังไม่ได้เขียน event</span></div>}{events.slice().reverse().map((ev,i)=><div className="ln" key={i}><span className="dim">[{String(ev.seq).padStart(2,'0')}]</span> <b>{ev.event}</b> <span className="dim">{ev.payload?.file || ev.payload?.warning || ''}</span> <span className={`tag ${String(ev.payload?.funnel||'').toLowerCase()}`}>{ev.payload?.funnel || ''}</span></div>)}</aside>
        </div>
        <div className="railbar"><i style={{width:`${progress}%`}} /></div>
        <div className="phases"><span className="ph ok">อ่านเนื้อหา + เสียง</span><span className="ph on">จัดชั้น funnel</span><span className="ph">เลือกกลุ่มเป้าหมาย</span><span className="ph">ตั้งงบ</span><span className="ph">เขียนแคปชั่น</span><span className="ph">ตรวจคำ อย.</span></div>
        {waitingForEngine && <div className="approve-bar" style={{position:'relative', marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,.08)'}}><button className="btn primary" type="button" onClick={() => router.push(`/batch/${id}/review`)}>เปิดใบสรุป mock เพื่อทดสอบ UI →</button><span className="later" style={{color:'#7FA1A9'}}>ถ้า engine ทำงานจริง หน้านี้จะขยับเองเมื่อมี progress_events และ batch_done</span></div>}
      </div>
    </div>
  </>;
}
