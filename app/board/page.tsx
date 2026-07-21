'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { mockBatch, mockCreatives } from '@/lib/mock-data';
import type { Creative } from '@/lib/types';
import { canApprove, useAuth } from '@/components/AuthProvider';

const lanes = [
  ['briefed', 'สื่อเข้าใหม่'], ['proposed', 'รอคุณอนุมัติแผน'], ['paused', 'สร้างแล้ว · พักไว้'], ['live', 'เปิดยิงแล้ว']
];
function temp(f:string){return <span className={`temp ${f.toLowerCase()}`}><span className="track"/> {f}</span>}

export default function BoardPage() {
  const { role } = useAuth();
  const allowed = canApprove(role);
  const [creatives, setCreatives] = useState<Creative[]>(mockCreatives);
  const [msg, setMsg] = useState('');
  useEffect(() => { const supabase=createClient(); if(!supabase)return; supabase.from('creatives').select('*').then(({data})=>{ if(data) setCreatives(data as Creative[]); }); }, []);
  async function activate(c: Creative) {
    if (!allowed) return;
    const supabase=createClient();
    if(!supabase){ setMsg(`Mock approve activate: ${c.ad_code}`); return; }
    const { data: u } = await supabase.auth.getUser();
    if(!u.user){ setMsg('กรุณา login ก่อนเปิดยิง'); return; }
    const { error } = await supabase.from('approvals').insert({ batch_id: mockBatch.id, proposal_version: 1, approved_by: u.user.id, channel: 'webui', mode: 'activate', overrides: { creative_id: c.id, ad_code: c.ad_code } });
    setMsg(error ? error.message : `ส่งคำขอ activate ${c.ad_code} แล้ว — engine จะเปิดจริง`);
  }
  return <>
    <div className="strip"><div className="meter"><div className="lab">เพซเป้าเดือนนี้</div><div className="val"><b className="mono">฿123,400</b><span>/ ฿300,000 · ตามเพซ</span></div><div className="bar"><i style={{width:'41%'}} /></div></div><div className="meter"><div className="lab">เพดานเปิดยิงอัตโนมัติวันนี้</div><div className="val"><b className="mono">฿480</b><span>/ 2,000</span></div><div className="bar"><i style={{width:'24%'}} /></div></div><div className="meter"><div className="lab">โฆษณาวิ่งอยู่จริง ต่อชั้น</div><div className="floorrow"><div className="floorcell c"><span className="t"/> TOF · 3</div><div className="floorcell w"><span className="t"/> MOF · 3</div><div className="floorcell h"><span className="t"/> BOF · 1 <small>ต่ำกว่าขั้นต่ำ</small></div></div></div></div>
    <div className="boardwrap">
      {msg && <div className="okbox" style={{marginBottom:12}}>{msg}</div>}
      <div className="board">
        {lanes.map(([status,title], idx) => { const arr=creatives.filter(c=>c.status===status || (status==='paused' && c.ads_status==='PAUSED') || (status==='live' && c.ads_status==='ACTIVE')); return <section className="col" key={status}><div className="col-head"><span className="step">0{idx+1}</span><h2>{title}</h2><span className="cnt">{arr.length}</span>{idx===1&&<span className="note gate">← จุดตัดสินของคน</span>}{idx===3&&<span className="note money">เงินกำลังทำงาน</span>}</div><div className="lane">{arr.map(c=><div className={`card ${status==='proposed'?'plan-c':''} ${status==='live'?'live-c':''}`} key={c.id}><div className="chiprow">{temp(c.funnel)}<span className="prov">{c.shorthand}</span></div><div className="namebox-s mono">{c.product} - {c.account_label} - {c.funnel} - {c.angle} - {c.topic} - {c.format} - {c.ad_code} - {c.version}</div><div className="specs"><div className="spec"><span className="k">Caption</span><span className="v">{c.caption}</span></div><div className="spec"><span className="k">Status</span><span className="v"><b>{c.ads_status || c.status}</b></span></div></div>{status==='paused'&&<div className="cardacts"><button className={`btn primary ${!allowed?'disabled-tip':''}`} title={!allowed?'เฉพาะ approver/admin เท่านั้น':''} disabled={!allowed} onClick={()=>activate(c)}>เปิดยิง →</button><button className="btn ghost">ดูรายละเอียด</button></div>}{status==='live'&&<div className="who">regen เฝ้าต่ออัตโนมัติ <button className="revlink">คำสั่งย้อนกลับ</button></div>}</div>)}</div></section>})}
      </div>
    </div>
  </>;
}
