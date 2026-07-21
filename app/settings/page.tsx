'use client';

import { useEffect, useMemo, useState } from 'react';
import { mockAccounts, mockShorthands } from '@/lib/mock-data';
import type { Account, Shorthand } from '@/lib/types';
import { useAuth } from '@/components/AuthProvider';

function temp(f:string){return <span className={`temp ${String(f || '').toLowerCase()}`}><span className="track"/> {f}</span>}

type Tab = 'accounts' | 'shorthands' | 'safety';
type SafetyConfig = { creator_auto_disabled:boolean; daily_budget_cap_thb:number; min_ads_per_funnel:number; require_paused_first:boolean; activation_requires_approval:boolean };
const DEFAULT_SAFETY: SafetyConfig = { creator_auto_disabled:false, daily_budget_cap_thb:2000, min_ads_per_funnel:2, require_paused_first:true, activation_requires_approval:true };
const emptyAccount: Account = { brand:'', product:'', account_label:'', act_id:'', page_ids:[], default_page_id:'', pixel_id:'', owner:'Mac', active:true };
const emptyShort: Shorthand = { code:'', funnel:'TOF', objective:'OUTCOME_ENGAGEMENT', optimization_goal:'LEAD_GENERATION', destination_type:'MESSENGER', regen_slot:'', allowed_funnels:['TOF'], active:true };
const joinCsv = (v?: string[]) => (v || []).join(', ');
const splitCsv = (v:any) => String(v || '').split(',').map((x)=>x.trim()).filter(Boolean);

export default function SettingsPage(){
  const { role } = useAuth();
  const [tab,setTab]=useState<Tab>('accounts');
  const [accounts,setAccounts]=useState<Account[]>(mockAccounts);
  const [shorts,setShorts]=useState<Shorthand[]>(mockShorthands);
  const [safety,setSafety]=useState<SafetyConfig>(DEFAULT_SAFETY);
  const [editingAccount,setEditingAccount]=useState<Account|null>(null);
  const [editingShort,setEditingShort]=useState<Shorthand|null>(null);
  const [msg,setMsg]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const operatorMode = true;

  const missingPixels=accounts.filter(a=>!a.pixel_id);
  const drift=accounts.filter(a=>(a.page_ids?.length||0)>1 || (!!a.default_page_id && !!a.page_ids?.length && !a.page_ids.includes(a.default_page_id)));
  const regenWarnings=shorts.filter(s=>!s.regen_slot || !s.allowed_funnels?.includes(s.funnel));

  async function apiPost(body:any){
    const res = await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const json = await res.json();
    if(!res.ok || !json.ok) throw new Error(json.error || 'บันทึกไม่สำเร็จ');
    return json;
  }

  async function refreshSettings(showMessage = false){
    setLoading(true); setError('');
    try{
      const res = await fetch('/api/settings', { cache:'no-store' });
      const json = await res.json();
      if(!res.ok || !json.ok) throw new Error(json.error || 'โหลด settings ไม่สำเร็จ');
      setAccounts(json.accounts || []);
      setShorts(json.shorthands || []);
      setSafety({ ...DEFAULT_SAFETY, ...(json.safety || {}) });
      if(showMessage) setMsg(`ตรวจใหม่แล้ว · accounts ${json.accounts?.length || 0} · shorthands ${json.shorthands?.length || 0}`);
    }catch(err:any){
      setError(err?.message || 'โหลด settings ไม่สำเร็จ');
      if(showMessage) setMsg('โหลด settings ไม่สำเร็จ');
    }finally{ setLoading(false); }
  }

  useEffect(()=>{ refreshSettings(); },[]);

  async function saveAccount(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget; const fd=new FormData(form);
    const account={
      id: editingAccount?.id,
      brand:String(fd.get('brand') || ''),
      product:String(fd.get('product') || fd.get('brand') || ''),
      account_label:String(fd.get('account_label') || ''),
      act_id:String(fd.get('act_id') || ''),
      page_ids:splitCsv(fd.get('page_ids')),
      default_page_id:String(fd.get('default_page_id') || '') || null,
      pixel_id:String(fd.get('pixel_id') || '') || null,
      owner:String(fd.get('owner') || 'Mac'),
      active:fd.get('active') === 'on',
    };
    setMsg(editingAccount?'กำลังแก้ไข account…':'กำลังเพิ่ม account…');
    try{
      const action = editingAccount ? 'update_account' : 'add_account';
      const json=await apiPost({ action, id: editingAccount?.id, account });
      setEditingAccount(null); form.reset(); await refreshSettings();
      setMsg(`${editingAccount?'แก้ไข':'เพิ่ม'} account แล้ว: ${json.account?.account_label || account.account_label}`);
    }catch(err:any){ setMsg(err?.message || 'บันทึก account ไม่สำเร็จ'); }
  }

  async function setAccountActive(a:Account, active:boolean){
    if(!a.id) return setMsg('account นี้ไม่มี id');
    try{ await apiPost({ action:'set_account_active', id:a.id, active }); await refreshSettings(); setMsg(`${active?'เปิดใช้':'ปิดใช้'} account: ${a.account_label}`); }
    catch(err:any){ setMsg(err?.message || 'เปลี่ยนสถานะ account ไม่สำเร็จ'); }
  }
  async function hardDeleteAccount(a:Account){
    if(!a.id) return setMsg('account นี้ไม่มี id');
    if(!confirm(`ลบ account mapping ${a.account_label} จริงหรือไม่? ถ้ามี creative อ้างอิงอาจลบไม่ผ่าน`)) return;
    try{ await apiPost({ action:'hard_delete_account', id:a.id }); await refreshSettings(); setMsg(`ลบ account แล้ว: ${a.account_label}`); }
    catch(err:any){ setMsg(err?.message || 'ลบไม่สำเร็จ — แนะนำปิดใช้แทนถ้ามีข้อมูลอ้างอิง'); }
  }

  async function saveShorthand(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget; const fd=new FormData(form);
    const shorthand={
      id: editingShort?.id,
      code:String(fd.get('code') || ''),
      funnel:String(fd.get('funnel') || '').toUpperCase(),
      objective:String(fd.get('objective') || ''),
      optimization_goal:String(fd.get('optimization_goal') || ''),
      destination_type:String(fd.get('destination_type') || 'MESSENGER'),
      regen_slot:String(fd.get('regen_slot') || ''),
      allowed_funnels:splitCsv(fd.get('allowed_funnels')).map((x)=>x.toUpperCase()),
      active:fd.get('active') === 'on',
    };
    setMsg(editingShort?'กำลังแก้ไข shorthand…':'กำลังเพิ่ม shorthand…');
    try{
      const action = editingShort ? 'update_shorthand' : 'add_shorthand';
      const json=await apiPost({ action, id: editingShort?.id, shorthand });
      setEditingShort(null); form.reset(); await refreshSettings();
      setMsg(`${editingShort?'แก้ไข':'เพิ่ม'} shorthand แล้ว: ${json.shorthand?.code || shorthand.code}`);
    }catch(err:any){ setMsg(err?.message || 'บันทึก shorthand ไม่สำเร็จ'); }
  }

  async function setShorthandActive(s:Shorthand, active:boolean){
    if(!s.id) return setMsg('shorthand นี้ไม่มี id');
    try{ await apiPost({ action:'set_shorthand_active', id:s.id, active }); await refreshSettings(); setMsg(`${active?'เปิดใช้':'ปิดใช้'} shorthand: ${s.code}`); }
    catch(err:any){ setMsg(err?.message || 'เปลี่ยนสถานะ shorthand ไม่สำเร็จ'); }
  }
  async function hardDeleteShorthand(s:Shorthand){
    if(!s.id) return setMsg('shorthand นี้ไม่มี id');
    if(!confirm(`ลบ shorthand ${s.code} จริงหรือไม่? ถ้ามี creative อ้างอิงอาจลบไม่ผ่าน`)) return;
    try{ await apiPost({ action:'hard_delete_shorthand', id:s.id }); await refreshSettings(); setMsg(`ลบ shorthand แล้ว: ${s.code}`); }
    catch(err:any){ setMsg(err?.message || 'ลบไม่สำเร็จ — แนะนำปิดใช้แทนถ้ามีข้อมูลอ้างอิง'); }
  }

  async function saveSafety(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const next:SafetyConfig={
      creator_auto_disabled:fd.get('creator_auto_disabled') === 'on',
      daily_budget_cap_thb:Number(fd.get('daily_budget_cap_thb') || 2000),
      min_ads_per_funnel:Number(fd.get('min_ads_per_funnel') || 2),
      require_paused_first:fd.get('require_paused_first') === 'on',
      activation_requires_approval:fd.get('activation_requires_approval') === 'on',
    };
    setSafety(next); setMsg('กำลังบันทึก safety settings…');
    try{ await apiPost({ action:'save_safety', safety:next }); await refreshSettings(); setMsg('บันทึก safety settings แล้ว'); }
    catch(err:any){ setMsg(err?.message || 'บันทึก safety settings ไม่สำเร็จ'); }
  }

  async function toggleKill(){
    const next=!safety.creator_auto_disabled;
    setSafety({...safety, creator_auto_disabled:next}); setMsg('กำลังบันทึก kill-switch…');
    try{ await apiPost({ action:'kill_switch', enabled: next }); await refreshSettings(); setMsg(next?'หยุดทางด่วนแล้ว':'เปิดทางด่วนอีกครั้ง'); }
    catch(err:any){ setSafety({...safety, creator_auto_disabled:!next}); setMsg(err?.message || 'บันทึก kill-switch ไม่สำเร็จ'); }
  }

  const visibleTab = useMemo(() => ({ accounts: tab==='accounts', shorthands: tab==='shorthands', safety: tab==='safety' }), [tab]);
  const accountForm = editingAccount || emptyAccount;
  const shortForm = editingShort || emptyShort;
  const selectedAccount = editingAccount || accounts[0] || emptyAccount;

  useEffect(()=>{
    if(!editingAccount && accounts.length) setEditingAccount(accounts[0]);
  },[accounts, editingAccount]);

  return <div className="wrap operator-wrap">
    <div className="hero operator-hero">
      <div>
        <span className="eyebrow">Settings</span>
        <h1>Operator Console</h1>
        <p className="sub">เลือก account ทางซ้าย แล้วแก้ Pixel / Page mapping ทางขวาทันที · ลดการเลื่อน ลดปุ่มรก และกันยิงผิดเพจ</p>
      </div>
      <div className="operator-actions">
        <div className="refresh">role: {role || 'viewer'} · {loading?'กำลังโหลด':'พร้อมใช้งาน'} <button onClick={()=>refreshSettings(true)} disabled={loading}>↻ ตรวจใหม่</button></div>
        <button className="btn primary" type="button" onClick={()=>{setTab('accounts'); setEditingAccount({...emptyAccount});}}>+ New account</button>
      </div>
    </div>

    {error && <div className="errbox" style={{marginBottom:16}}>Settings API error: {error}</div>}
    {msg && <div className="okbox" style={{marginBottom:16}} aria-live="polite">{msg}</div>}

    <div className="scorebar">
      <div className="score"><span className="chip risk">Critical</span><b>{missingPixels.length} missing pixels</b><small>แก้ก่อนสร้าง BOF audience</small></div>
      <div className="score"><span className="chip warn">Review</span><b>{drift.length} page mapping</b><small>ตรวจ default page / หลายเพจ</small></div>
      <div className="score"><span className="chip ok">Guard</span><b>{safety.require_paused_first?'Paused first':'Check guard'}</b><small>{safety.activation_requires_approval?'ต้อง approval ก่อน live':'ตรวจ approval policy'}</small></div>
    </div>

    <div className="subtabs operator-tabs" role="tablist" aria-label="Settings sections">
      <button role="tab" aria-selected={visibleTab.accounts} className={visibleTab.accounts?'on':''} onClick={()=>setTab('accounts')}>Accounts <span className="warn">{missingPixels.length}</span></button>
      <button role="tab" aria-selected={visibleTab.shorthands} className={visibleTab.shorthands?'on':''} onClick={()=>setTab('shorthands')}>Objective rules <span className="warn">{regenWarnings.length}</span></button>
      <button role="tab" aria-selected={visibleTab.safety} className={visibleTab.safety?'on':''} onClick={()=>setTab('safety')}>Safety guard</button>
    </div>

    {visibleTab.accounts && <div className="console settings-console">
      <section className="card list-pane" aria-label="Accounts list">
        <div className="pane-head">
          <div className="pane-title-row"><div><h2>Accounts</h2><p>เลือกบัญชีเพื่อแก้ข้อมูลทางขวา</p></div><span className="chip ok">{accounts.length} rows</span></div>
          <input className="search" aria-label="Search accounts" placeholder="Search brand, ACT ID, page ID" />
        </div>
        <div className="account-list">
          {accounts.map(a=>{
            const isSelected = selectedAccount.id ? selectedAccount.id === a.id : selectedAccount.account_label === a.account_label;
            const hasPixel = Boolean(a.pixel_id);
            const hasDrift = (a.page_ids?.length||0)>1 || (!!a.default_page_id && !!a.page_ids?.length && !a.page_ids.includes(a.default_page_id));
            return <button type="button" className={`account-item ${isSelected?'active':''}`} key={a.id||a.account_label} onClick={()=>setEditingAccount(a)} aria-current={isSelected?'true':undefined}>
              <div><b>{a.account_label}</b><small>{a.product || a.brand} · ACT {a.act_id}</small></div>
              {!hasPixel ? <span className="chip risk">Pixel</span> : hasDrift ? <span className="chip warn">Mapping</span> : <span className="chip ok">Ready</span>}
            </button>;
          })}
          {!accounts.length && <div className="empty-state"><b>ยังไม่มี account</b><p>เพิ่ม account mapping เพื่อเริ่มใช้งาน Creator Ads Console</p><button className="btn primary" type="button" onClick={()=>setEditingAccount({...emptyAccount})}>+ เพิ่ม account</button></div>}
        </div>
      </section>

      <form className="card inspect" key={selectedAccount.id || selectedAccount.account_label || 'new-account'} onSubmit={saveAccount} aria-label="Account inspector">
        <div className="inspect-top">
          <div>
            {!selectedAccount.pixel_id ? <span className="chip risk">Pixel missing</span> : <span className="chip ok">Ready</span>}
            <h2>{selectedAccount.account_label || 'New account'}</h2>
            <p>{selectedAccount.account_label ? 'แก้ Brand, ACT ID, Page ID และ Pixel ID ของ account นี้' : 'เพิ่ม account mapping ใหม่'}</p>
          </div>
          {selectedAccount.id && <button className="btn ghost" type="button" onClick={()=>refreshSettings(true)}>Activity</button>}
        </div>

        <div className="form inspector-form">
          <div className="field"><label htmlFor="brand">Brand</label><input id="brand" name="brand" required defaultValue={accountForm.brand} placeholder="เช่น HAPPY Life" /></div>
          <div className="field"><label htmlFor="product">Product</label><input id="product" name="product" defaultValue={accountForm.product || ''} placeholder="เช่น HMO / ASTA / OMG" /></div>
          <div className="field"><label htmlFor="account_label">Account Label</label><input id="account_label" name="account_label" required defaultValue={accountForm.account_label} placeholder="ชื่อที่ทีมใช้เรียก" /></div>
          <div className="field"><label htmlFor="act_id">ACT ID</label><input id="act_id" name="act_id" required defaultValue={accountForm.act_id} placeholder="603593437444446" /></div>
          <div className="field"><label htmlFor="page_ids">Page IDs CSV</label><input id="page_ids" name="page_ids" defaultValue={joinCsv(accountForm.page_ids)} placeholder="246993791830119" /><div className="hint">ใส่หลายเพจได้โดยคั่น comma</div></div>
          <div className="field"><label htmlFor="default_page_id">Default Page ID</label><input id="default_page_id" name="default_page_id" defaultValue={accountForm.default_page_id || ''} placeholder="เพจหลักสำหรับยิงแอด" /></div>
          <div className="field"><label htmlFor="pixel_id">Pixel ID</label><input id="pixel_id" name="pixel_id" defaultValue={accountForm.pixel_id || ''} placeholder="ใส่ Pixel ID ที่นี่" /><div className="hint risk">จำเป็นสำหรับ BOF audience บางชนิด</div></div>
          <div className="field"><label htmlFor="owner">Owner</label><input id="owner" name="owner" defaultValue={accountForm.owner || 'Mac'} placeholder="Mac" /></div>
          <label className="check-field"><input name="active" type="checkbox" defaultChecked={accountForm.active !== false}/> Active account</label>
        </div>

        <div className="danger-zone">
          <div><b>Danger area</b><div>ปิดใช้/ลบ account ต้องตั้งใจเลือกเท่านั้น เพื่อกันกระทบ creative เดิม</div></div>
          <div className="row-actions">
            {selectedAccount.id && <button className="btn ghost" type="button" onClick={()=>setAccountActive(selectedAccount,!selectedAccount.active)}>{selectedAccount.active?'Deactivate':'Activate'}</button>}
            {selectedAccount.id && <button className="btn danger" type="button" onClick={()=>hardDeleteAccount(selectedAccount)}>Delete</button>}
          </div>
        </div>

        <div className="inspect-actions">
          <button className="btn ghost" type="button" onClick={()=>setEditingAccount(accounts[0] || null)}>Cancel</button>
          <button className="btn primary" type="submit">{selectedAccount.id?'Save mapping':'Create account'}</button>
        </div>
      </form>
    </div>}

    {visibleTab.shorthands && <div className="console settings-console single-pane">
      <section className="card list-pane">
        <div className="pane-head"><div className="pane-title-row"><div><h2>Objective rules</h2><p>คำย่อในชื่อ → การตั้งค่าจริงบน Meta</p></div><span className="chip ok">{shorts.length} rules</span></div></div>
        <div className="account-list">{shorts.map(s=><button type="button" className={`account-item ${editingShort?.id===s.id?'active':''}`} key={s.id||s.code} onClick={()=>setEditingShort(s)}><div><b>{s.code}</b><small>{s.objective} · {s.optimization_goal}</small></div>{temp(s.funnel)}</button>)}</div>
      </section>
      <form className="card inspect" key={editingShort?.id || 'new-short'} onSubmit={saveShorthand}>
        <div className="inspect-top"><div><span className="chip ok">Rule</span><h2>{editingShort?.code || 'New shorthand'}</h2><p>กำหนด mapping funnel/objective/goal สำหรับ engine</p></div><button className="btn primary" type="button" onClick={()=>setEditingShort({...emptyShort})}>+ New rule</button></div>
        <div className="form inspector-form">
          <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" required defaultValue={shortForm.code} placeholder="ENG-LEAD"/></div>
          <div className="field"><label htmlFor="funnel">Funnel</label><select id="funnel" name="funnel" defaultValue={shortForm.funnel}><option>TOF</option><option>MOF</option><option>BOF</option><option>RTT</option></select></div>
          <div className="field"><label htmlFor="objective">Objective</label><input id="objective" name="objective" required defaultValue={shortForm.objective}/></div>
          <div className="field"><label htmlFor="optimization_goal">Optimization Goal</label><input id="optimization_goal" name="optimization_goal" required defaultValue={shortForm.optimization_goal}/></div>
          <div className="field"><label htmlFor="destination_type">Destination</label><input id="destination_type" name="destination_type" defaultValue={shortForm.destination_type || 'MESSENGER'}/></div>
          <div className="field"><label htmlFor="regen_slot">Regen Slot</label><input id="regen_slot" name="regen_slot" required defaultValue={shortForm.regen_slot}/></div>
          <div className="field"><label htmlFor="allowed_funnels">Allowed Funnels CSV</label><input id="allowed_funnels" name="allowed_funnels" defaultValue={joinCsv(shortForm.allowed_funnels)}/></div>
          <label className="check-field"><input name="active" type="checkbox" defaultChecked={shortForm.active !== false}/> Active rule</label>
        </div>
        <div className="danger-zone"><div><b>Danger area</b><div>ปิดใช้ก่อนลบ ถ้ามี creative อ้างอิง rule นี้</div></div><div className="row-actions">{editingShort?.id && <button className="btn ghost" type="button" onClick={()=>setShorthandActive(editingShort,!editingShort.active)}>{editingShort.active?'Deactivate':'Activate'}</button>}{editingShort?.id && <button className="btn danger" type="button" onClick={()=>hardDeleteShorthand(editingShort)}>Delete</button>}</div></div>
        <div className="inspect-actions"><button className="btn ghost" type="button" onClick={()=>setEditingShort(null)}>Cancel</button><button className="btn primary" type="submit">{editingShort?.id?'Save rule':'Create rule'}</button></div>
      </form>
    </div>}

    {visibleTab.safety && <form className="card inspect safety-pane" key={`safety-${String(safety.creator_auto_disabled)}-${safety.daily_budget_cap_thb}`} onSubmit={saveSafety}>
      <div className="inspect-top"><div><span className={safety.creator_auto_disabled?'chip risk':'chip ok'}>{safety.creator_auto_disabled?'Stopped':'Guard active'}</span><h2>Safety guard</h2><p>กำแพงกันเงินรั่วและ policy ก่อนสร้างแคมเปญจริง</p></div></div>
      <div className="form inspector-form">
        <div className="field"><label htmlFor="daily_budget_cap_thb">Daily Budget Cap / Day</label><input id="daily_budget_cap_thb" name="daily_budget_cap_thb" type="number" min="0" defaultValue={safety.daily_budget_cap_thb}/></div>
        <div className="field"><label htmlFor="min_ads_per_funnel">Min Ads / Funnel</label><input id="min_ads_per_funnel" name="min_ads_per_funnel" type="number" min="0" defaultValue={safety.min_ads_per_funnel}/></div>
        <label className="check-field"><input name="require_paused_first" type="checkbox" defaultChecked={safety.require_paused_first}/> สร้างในสถานะพัก (Paused) — ยังไม่มีการใช้จ่าย</label>
        <label className="check-field"><input name="activation_requires_approval" type="checkbox" defaultChecked={safety.activation_requires_approval}/> Activation needs approval</label>
        <label className="check-field"><input name="creator_auto_disabled" type="checkbox" defaultChecked={safety.creator_auto_disabled}/> Kill-switch</label>
      </div>
      <div className="danger-zone"><div><b>ปุ่มหยุดฉุกเฉิน</b><div>/api/engine/approve จะ block live create ถ้าเปิดอยู่</div></div><div className="switch"><span className={`swlabel ${safety.creator_auto_disabled?'off':'on'}`}>{safety.creator_auto_disabled?'หยุดฉุกเฉินแล้ว':'ทางด่วนเปิดอยู่'}</span><button className={`sw ${safety.creator_auto_disabled?'off':''}`} type="button" title="Toggle kill-switch" onClick={toggleKill}/></div></div>
      <div className="inspect-actions"><button className="btn primary" type="submit">Save safety guard</button></div>
    </form>}
  </div>;
}
