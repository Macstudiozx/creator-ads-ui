'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { Proposal } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { role } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [status, setStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [openCopyGroups, setOpenCopyGroups] = useState<Record<string, boolean>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const allowed = true;

  useEffect(() => {
    const loadServerProposal = async () => {
      try {
        const res = await fetch(`/api/batch/${id}/events`, { cache: 'no-store' });
        const json = await res.json();
        if (json.proposal) {
          setProposal(json.proposal as Proposal);
          setLoadError('');
          if (json.mediaUrls) setMediaUrls(json.mediaUrls);
          if (json.result) setResult(json.result);
        } else {
          setLoadError(json.error || 'ยังไม่มี proposal สำหรับ batch นี้');
        }
      } catch (err:any) {
        setLoadError(err?.message || 'โหลด proposal ไม่สำเร็จ');
      }
    };

    // Load through the server route first so review pages do not depend on browser RLS/session state.
    // The same response also returns signed Storage URLs for thumbnails.
    loadServerProposal();
  }, [id]);

  useEffect(() => {
    if (!proposal) return;
    const hydrateServerMedia = async () => {
      try {
        const res = await fetch(`/api/batch/${id}/events`, { cache: 'no-store' });
        const json = await res.json();
        if (json.mediaUrls) setMediaUrls((prev) => ({ ...prev, ...json.mediaUrls }));
        if (json.result) setResult(json.result);
      } catch {}
    };
    hydrateServerMedia();
    const supabase = createClient();
    if (!supabase) return;
    const ads = (proposal.plan?.groups || []).flatMap((g:any) => g.ads || []);
    const paths = [...new Set(ads.map((ad:any) => ad.media_path).filter(Boolean))] as string[];
    if (!paths.length) return;
    let cancelled = false;
    Promise.all(paths.map(async (p) => {
      const { data, error } = await supabase.storage.from('creative-media').createSignedUrl(p, 60 * 60);
      return error || !data?.signedUrl ? null : [p, data.signedUrl] as const;
    })).then(rows => {
      if (cancelled) return;
      setMediaUrls(prev => ({ ...prev, ...Object.fromEntries(rows.filter(Boolean) as [string, string][]) }));
    });
    return () => { cancelled = true; };
  }, [proposal]);

  async function approve() {
    if (!proposal) return;
    setStatus('กำลังส่ง Approval และสั่ง Engine สร้าง Campaign / Ad Set แบบ PAUSED…');
    try {
      const res = await fetch('/api/engine/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: id,
          proposal_version: proposal.version,
          overrides: {
            source: 'ui-live-create-button',
            groups: proposal.plan?.groups?.map((g:any)=>({ funnel:g.funnel, daily_budget_thb:g.daily_budget_thb }))
          }
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const engineError = json.result?.detail?.errors?.[0]?.error || json.error || 'สร้างไม่สำเร็จ';
        setStatus(`สร้างไม่สำเร็จ: ${engineError}`);
        return;
      }
      const created = json.result?.detail?.created || [];
      const first = created[0] || {};
      const campaignId = first.campaign?.id || '-';
      const adsetId = first.adset?.id || '-';
      setResult(json.result || null);
      setStatus(`สร้างจริงแบบ PAUSED สำเร็จ · Campaign ${campaignId} · Ad Set ${adsetId}`);
    } catch (err:any) {
      setStatus(err?.message || 'สร้างไม่สำเร็จ');
    }
  }

  if (!proposal) return <div className="wrap"><div className="stage"><h2>กำลังโหลดแผนแคมเปญ…</h2><div className="okbox">{loadError || 'กำลังดึงข้อมูล Proposal ล่าสุดจากระบบ'}</div></div></div>;
  const groups = proposal.plan?.groups || [];
  const summary = proposal.summary || {};
  const isVideo = (p?: string) => /\.(mp4|mov|m4v|webm)$/i.test(p || '');
  const isImage = (p?: string) => /\.(png|jpe?g|webp|gif)$/i.test(p || '');
  const complianceLabel = (status?: string) => status === 'pass' ? 'ไม่พบคำเสี่ยงเบื้องต้น' : (status || 'รอตรวจสอบ');
  const createdGroups = result?.detail?.created || [];
  const firstCreated = createdGroups[0] || {};
  const hasCampaign = !!firstCreated.campaign?.id;
  const hasAdset = !!firstCreated.adset?.id;
  const createdAds = createdGroups.flatMap((g:any) => g.ads || []);
  const skippedAds = createdGroups.flatMap((g:any) => g.skipped_ads || []);
  const allAds = groups.flatMap((g:any) => g.ads || []);
  const metaReadyAds = createdAds.length ? createdAds : allAds.filter((ad:any) => ad.feed_payload?.image_hash || ad.feed_payload?.video_id || ad.feed_payload?.object_story_id);
  const objectRows = [
    { label: 'Campaign', id: firstCreated.campaign?.id || 'รอสร้าง', state: hasCampaign ? 'PAUSED' : 'PLANNED', tone: hasCampaign ? 'paused' : 'planned', note: hasCampaign ? 'สร้างจริงแล้วและยังไม่ใช้เงิน' : 'จะสร้างหลังอนุมัติ' },
    { label: 'Ad Set', id: firstCreated.adset?.id || 'รอสร้าง', state: hasAdset ? 'PAUSED' : 'PLANNED', tone: hasAdset ? 'paused' : 'planned', note: hasAdset ? 'Budget / Audience พร้อมตรวจ' : 'จะสร้างใต้ Campaign' },
    { label: 'Creative', id: metaReadyAds.length ? `${metaReadyAds.length}/${allAds.length || 0} media ready` : (allAds.length ? 'รอ media id' : 'ไม่มี creative'), state: metaReadyAds.length ? 'READY' : 'CHECK', tone: metaReadyAds.length ? 'ready' : 'warn', note: 'ต้องมี image_hash / video_id / object_story_id ก่อนสร้าง Ad' },
    { label: 'Ad', id: createdAds[0]?.id || (skippedAds.length ? 'ถูกข้าม' : 'รอสร้าง'), state: createdAds.length ? 'PAUSED / IN_PROCESS' : (skippedAds.length ? 'MISSING MEDIA' : 'PLANNED'), tone: createdAds.length ? 'process' : (skippedAds.length ? 'warn' : 'planned'), note: createdAds.length ? 'Ad มีจริงแล้ว รอ Meta review/processing' : (skippedAds[0]?.reason || 'จะสร้างหลังมี Creative พร้อม') },
  ];
  const flowSteps = [
    { label: 'Upload', sub: 'Media intake', done: true },
    { label: 'Analyze', sub: 'Mapping / Proposal', done: true },
    { label: 'Campaign', sub: hasCampaign ? firstCreated.campaign.id : 'Planned', done: hasCampaign },
    { label: 'Ad Set', sub: hasAdset ? firstCreated.adset.id : 'Planned', done: hasAdset },
    { label: 'Creative', sub: metaReadyAds.length ? 'Media registered' : 'Need media id', done: metaReadyAds.length > 0, warn: !metaReadyAds.length && allAds.length > 0 },
    { label: 'Ad', sub: createdAds[0]?.id || (skippedAds.length ? 'Skipped' : 'Planned'), done: createdAds.length > 0, warn: skippedAds.length > 0 },
  ];
  return <>
    <div className="stepper"><div className="stp done"><span className="d">✓</span><span className="t">อัปโหลดสื่อ<small>Media intake</small></span></div><div className="scon done"/><div className="stp done"><span className="d">✓</span><span className="t">วิเคราะห์แผน<small>Funnel · Audience · Budget · Copy</small></span></div><div className="scon done"/><div className="stp now"><span className="d">3</span><span className="t">ตรวจสอบและอนุมัติ<small>Review package</small></span></div></div>
    <div className="stage">
      <div className="sheet-h pro"><div><span className="eyebrow">Campaign Approval Package</span><h2>ตรวจสอบแผนก่อนสร้างจริง</h2><p>ตรวจ Campaign, Ad Set, Audience, Budget และ Creative Copy ก่อนส่งให้ Engine สร้างแบบ PAUSED</p></div><span className="sub mono">Batch {id} · Proposal v{proposal.version}</span></div>
      <div className="grand"><div className="g-num"><div className="n">{summary.campaigns ?? groups.length}</div><div className="l">Campaigns</div></div><div className="g-num"><div className="n">{summary.adsets ?? 0}</div><div className="l">ad sets</div></div><div className="g-num"><div className="n">{summary.ads_ready ?? 0}</div><div className="l">Creatives ready</div></div><div className="divider"/><div className="g-num"><div className="n mono">฿{Number(summary.budget ?? 0).toLocaleString('th-TH')}</div><div className="l">Daily budget</div></div><div className="g-num"><div className="n">{summary.hold ?? proposal.plan?.hold?.length ?? 0}</div><div className="l">Items on hold</div></div><div className="paused-note"><b>Safe launch mode</b><span>ทุก Campaign/Ad Set จะถูกสร้างเป็น PAUSED เท่านั้น ยังไม่มีการใช้เงินจนกว่าจะเปิดใช้งานภายหลัง</span></div></div>
      <section className="ops-v2">
        <div className="ops-v2-head"><div><span className="eyebrow">Launch Readiness</span><h3>สถานะก่อนสร้างจริง</h3><p>ดูภาพรวม Campaign / Ad Set / Creative / Ad แบบการ์ด ไม่ต้องไล่อ่านเป็นแถวยาว</p></div><span className={`ops-live ${createdAds.length ? 'ready' : skippedAds.length ? 'warn' : 'planned'}`}>{createdAds.length ? 'Ad exists · PAUSED' : skippedAds.length ? 'Need media completion' : 'Ready for PAUSED create'}</span></div>
        <div className="ops-flow">{flowSteps.map((step:any, idx:number) => <div className={`ops-step ${step.done ? 'done' : step.warn ? 'warn' : 'wait'}`} key={step.label}><span className="ops-dot">{step.done ? '✓' : idx + 1}</span><b>{step.label}</b><small>{step.sub}</small></div>)}</div>
        <div className="object-matrix">{objectRows.map((row:any) => <div className={`object-card ${row.tone}`} key={row.label}><div className="object-top"><span>{row.label}</span><b>{row.state}</b></div><div className="object-id mono">{row.id}</div><p>{row.note}</p></div>)}</div>
      </section>
      {groups.map((g:any, gi:number) => {
        const groupKey = `${g.funnel || 'group'}-${g.shorthand || ''}-${gi}`;
        const copyOpen = !!openCopyGroups[groupKey];
        return <div className="fgrp" key={groupKey}>
        <div className="fgrp-main"><div className="fcol1"><span className={`temp ${String(g.funnel).toLowerCase()}`}><span className="track"/> {g.funnel} · {g.funnel==='TOF'?'Prospecting':g.funnel==='MOF'?'Warm audience':'High intent'}</span><div className="cnt2"><b style={{color:'var(--ink)'}}>{g.ads?.length || 0} creative</b> · 1 ad set</div><div className="thumbstrip">{(g.ads || []).slice(0,3).map((ad:any, ai:number) => { const url = mediaUrls[ad.media_path]; return <span className={`th media-thumb v${(ai % 6) + 1}`} key={ad.ad_code || ai}>{url && isImage(ad.media_path) ? <img src={url} alt={ad.ad_code || 'media'} /> : url && isVideo(ad.media_path) ? <video src={url} muted playsInline preload="metadata" /> : <b>{isVideo(ad.media_path) ? '▶' : 'IMG'}</b>}</span>; })}{(g.ads?.length || 0) > 3 && <span className="th more">+{(g.ads?.length || 0)-3}</span>}</div></div>
          <div className="fcol2"><div className="krow"><span className="k">Audience</span><span className="v"><b>{g.audience?.include?.map((a:any)=>a.name).join(', ') || '-'}</b> · Exclude: <span className="ex">{g.audience?.exclude?.map((a:any)=>a.name).join(', ') || '-'}</span></span></div><div className="krow"><span className="k">Planning basis</span><span className="v">{g.budget_basis}</span></div><div className="krow"><span className="k">Campaign name</span><span className="v namev mono">{g.campaign_name}</span></div></div>
          <div className="fcol3"><div className="budget-edit"><label>Daily budget</label><input className="mono" defaultValue={Number(g.daily_budget_thb || 0).toLocaleString('th-TH')} /></div><div className="bud-hint">ปรับได้ก่อนอนุมัติ</div></div></div>
        <div className="fgrp-foot"><button className="peek" type="button" aria-expanded={copyOpen} onClick={() => setOpenCopyGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}>{copyOpen ? 'ซ่อนรายละเอียด Creative' : 'ดูรายละเอียด Creative'} ({g.ads?.length || 0}) {copyOpen ? '▴' : '▾'}</button></div>
        <div className={`caplist ${copyOpen ? 'open' : ''}`}>{(g.ads || []).map((ad:any, ai:number) => { const url = mediaUrls[ad.media_path]; return <div className="caprow" key={ad.ad_code || ai}><span className={`th media-thumb cap-media v${(ai % 6) + 1}`}>{url && isImage(ad.media_path) ? <img src={url} alt={ad.ad_code || 'media'} /> : url && isVideo(ad.media_path) ? <video src={url} controls muted playsInline preload="metadata" /> : <b>{isVideo(ad.media_path) ? 'VIDEO' : 'IMG'}</b>}</span><div><div className="hl">{ad.ad_code || `AD${ai+1}`} · {ad.headline || '-'} <span className="chr">Headline</span></div><div className="cp">{ad.caption || '-'}</div><div className="tools"><span className="tone">Format: {ad.format || '-'}</span><span className="tone">Compliance: {complianceLabel(ad.fda?.status)}</span><span className="tone">Media: {ad.media_path || '-'}</span></div></div></div>; })}</div>
      </div>})}
      {!!proposal.plan?.hold?.length && <div className="except"><h3>รายการที่ต้องตรวจเพิ่ม {proposal.plan.hold.length} รายการ <small>— จะไม่ถูกสร้างในรอบนี้</small></h3>{proposal.plan.hold.map((h:any,i:number)=><div className="issue" key={i}><span className="th v4"/><div className="why"><span className="f">{h.file}</span><b>{h.reason}</b></div><div className="iact"><button className="btn mini2 ghost">ยืนยันใช้</button><button className="btn mini2 ghost" style={{color:'var(--risk)'}}>ไม่ใช้รายการนี้</button></div></div>)}</div>}
      <div className="finals"><div className="checks"><div className="chk"><span className="s">✓</span> Campaign naming ตรงกับ Funnel และ Audience</div><div className="chk"><span className="s">✓</span> Web UI ทำเฉพาะ Approval — Meta token อยู่ฝั่ง Engine</div><div className="chk"><span className="s">✓</span> Approval ผูกกับผู้ใช้งานที่เข้าสู่ระบบ</div></div><div className="approve-bar"><button className={`btn primary big ${(!allowed || hasCampaign)?'disabled-tip':''}`} disabled={!allowed || hasCampaign} title={!allowed?'เฉพาะ approver/admin เท่านั้น':hasCampaign?'Batch นี้มี Campaign/Ad Set แล้ว กันการสร้างซ้ำ':''} onClick={approve}>{hasCampaign ? 'สร้างครบแล้วแบบ PAUSED' : 'อนุมัติและสร้างแบบ PAUSED'}<small>{hasCampaign ? 'ระบบป้องกันการสร้างซ้ำ — ใช้ Refresh เพื่อตรวจสถานะล่าสุด' : 'Engine จะสร้าง Campaign / Ad Set แบบพักไว้'}</small></button><button className="btn ghost" type="button">Refresh / บันทึกไว้ก่อน</button><span className="later">Approval: server-side execute · Role: {role} · Activation แยก approval อีกชั้น</span></div>{status && <div className="okbox" style={{marginTop:12}}>{status}</div>}</div>
    </div>
  </>;
}
