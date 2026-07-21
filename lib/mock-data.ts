import type { Account, Batch, Creative, ProgressEvent, Proposal, Result, Role, Shorthand } from './types';

export const mockUser = { id: 'mock-user', email: 'operator@attop99.test', role: 'admin' as Role };

export const mockAccounts: Account[] = [
  { id: 'acc-hmo', brand: 'HMO', product: 'HMO', account_label: 'HAPPY Life', act_id: '603593437444446', page_ids: ['246993791830119'], default_page_id: '246993791830119', pixel_id: null, owner: 'Mac', active: true },
  { id: 'acc-age', brand: 'HMO', product: 'HMO', account_label: 'อายุยืน', act_id: '1550298176199324', page_ids: ['age-1','age-2','age-3'], default_page_id: 'age-1', pixel_id: null, owner: 'Mac', active: true },
  { id: 'acc-asta', brand: 'ASTA', product: 'ASTA', account_label: 'สุขภาพดี', act_id: '828326256875829', page_ids: ['561045733764039'], default_page_id: '561045733764039', pixel_id: null, owner: 'Mik', active: true },
  { id: 'acc-omg', brand: 'OMG', product: 'OMG', account_label: 'คุยเฟื่อง', act_id: '1415468563577423', page_ids: ['617344948123314'], default_page_id: '617344948123314', pixel_id: null, owner: 'Mik', active: true },
];

export const mockShorthands: Shorthand[] = [
  { id: 'sh-eng-lead', code: 'ENG-LEAD', funnel: 'TOF', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'LEAD_GENERATION', destination_type: 'MESSENGER', regen_slot: 'tof_eng_lead', allowed_funnels: ['TOF'], active: true },
  { id: 'sh-eng-chat', code: 'ENG-CHAT', funnel: 'MOF', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', destination_type: 'MESSENGER', regen_slot: 'mof_eng_chat', allowed_funnels: ['MOF','BOF'], active: true },
  { id: 'sh-sales-ptm', code: 'Sales-PTM', funnel: 'BOF', objective: 'OUTCOME_SALES', optimization_goal: 'MESSAGING_PURCHASE_CONVERSION', destination_type: 'MESSENGER', regen_slot: 'bof_sales_ptm', allowed_funnels: ['BOF'], active: true },
];

export const mockBatch: Batch = { id: '00000000-0000-4000-8000-000000000001', code: 'B-20260716-0932', brand: 'DRJADE', promo: '7.7', brand_tone: 'อบอุ่น·น่าเชื่อถือ', status: 'proposed' };

export const mockProgress: ProgressEvent[] = [
  { batch_id: mockBatch.id, seq: 1, event: 'batch_started', payload: { total: 24 } },
  { batch_id: mockBatch.id, seq: 2, event: 'classified', payload: { file: 'knee_pain_hook_final.mp4', funnel: 'TOF', confidence: 88, signals: ['เปิดปัญหา', 'ไม่มีราคา'] } },
  { batch_id: mockBatch.id, seq: 3, event: 'classified', payload: { file: 'review_khun_mae_v3.mp4', funnel: 'MOF', confidence: 82, signals: ['รีวิว', 'เคยสนใจ'] } },
  { batch_id: mockBatch.id, seq: 4, event: 'classified', payload: { file: 'promo_bundle_77.mp4', funnel: 'BOF', confidence: 95, signals: ['ราคา', 'โปร 7.7'] } },
  { batch_id: mockBatch.id, seq: 5, event: 'fda_check', payload: { file: 'review_khun_mae_v3.mp4', warning: 'หายขาด → ดีขึ้นจนสังเกตได้' } },
  { batch_id: mockBatch.id, seq: 6, event: 'batch_done', payload: { proposal_id: 'mock-proposal' } },
];

export const mockProposal: Proposal = {
  id: 'mock-proposal', batch_id: mockBatch.id, version: 1, expires_at: '2026-07-17T09:32:00+07:00',
  summary: { campaigns: 3, adsets: 4, ads_ready: 18, budget: 4700, hold: 6 },
  plan: {
    groups: [
      { funnel: 'TOF', campaign_name: 'DRJADE - 7.7 - TOF - Acquire - PainPoint - IMG - AD000133–140', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'LEAD_GENERATION', daily_budget_thb: 2000, budget_basis: 'playbook: winner TOF 90d', audience: { include: [{ name: 'broad_th_25_65', kind: 'broad' }], exclude: [{ name: 'purchasers_180d', kind: 'existing' }], to_create: [] }, ads: [{ ad_code: 'AD000133', caption: 'เข่าลั่นทุกครั้งที่ลุก? อ่านก่อนสาย', headline: 'ทักแชทรับคำแนะนำ', fda: { status: 'pass' } }] },
      { funnel: 'MOF', campaign_name: 'DRJADE - 7.7 - MOF - Educate - Review - VDO - AD000141–146', objective: 'OUTCOME_ENGAGEMENT', optimization_goal: 'CONVERSATIONS', daily_budget_thb: 1200, budget_basis: 'MOF winners 90d', audience: { include: [{ name: 'page_engagers_365d', kind: 'existing' }], exclude: [{ name: 'purchasers_7d', kind: 'existing' }], to_create: [{ name: 'video_50pct_180d', kind: 'custom' }] }, ads: [{ ad_code: 'AD000141', caption: 'รีวิวจริงจากคุณแม่ที่กลับมาเดินเที่ยวได้', headline: 'ฟังจากปากจริง', fda: { status: 'pass' } }] },
      { funnel: 'BOF', campaign_name: 'DRJADE - 7.7 - BOF - Promotion - Bundle - VDO - AD000147–150', objective: 'OUTCOME_SALES', optimization_goal: 'MESSAGING_PURCHASE_CONVERSION', daily_budget_thb: 1500, budget_basis: 'BOF Hero', audience: { include: [{ name: 'messaged_365d', kind: 'existing' }], exclude: [{ name: 'purchasers_7d', kind: 'existing' }], to_create: [] }, ads: [{ ad_code: 'AD000147', caption: 'โปร 7.7 มาแล้ว — เฉพาะคนที่เคยทักเท่านั้น', headline: 'รับสิทธิ์ก่อนหมด', fda: { status: 'pass' } }] },
    ],
    hold: [{ file: 'DRJADE-TOF-promo_slash50_v2.mp4', reason: 'ป้าย TOF แต่มีราคาแบบ BOF' }],
  },
};

export const mockCreatives: Creative[] = [
  { id: 'cr1', ad_code: 'AD000133', product: 'HMO', account_label: 'HAPPY Life', funnel: 'TOF', shorthand: 'ENG-LEAD', angle: 'Acquire', topic: 'PainPoint', format: 'VDO', version: 'V01', caption: 'เข่าลั่นทุกครั้งที่ลุก?', headline: 'อ่านก่อนสาย', status: 'briefed' },
  { id: 'cr2', ad_code: 'AD000141', product: 'HMO', account_label: 'HAPPY Life', funnel: 'MOF', shorthand: 'ENG-CHAT', angle: 'Educate', topic: 'Review', format: 'VDO', version: 'V01', caption: 'รีวิวจริงจากคุณแม่', headline: 'ฟังจากปากจริง', status: 'proposed' },
  { id: 'cr3', ad_code: 'AD000147', product: 'HMO', account_label: 'HAPPY Life', funnel: 'BOF', shorthand: 'Sales-PTM', angle: 'Promotion', topic: 'Bundle', format: 'VDO', version: 'V01', caption: 'โปร 7.7 มาแล้ว', headline: 'รับสิทธิ์ก่อนหมด', status: 'paused', ads_status: 'PAUSED' },
  { id: 'cr4', ad_code: 'AD000114', product: 'HMO', account_label: 'HAPPY Life', funnel: 'BOF', shorthand: 'Sales-PTM', angle: 'Promotion', topic: 'Promo', format: 'VDO', version: 'V03', caption: 'โปรแรงวันนี้', headline: 'ทักแชท', status: 'live', ads_status: 'ACTIVE' },
];

export const mockResults: Result[] = [{ id: 'r1', batch_id: mockBatch.id, status: 'created_paused', detail: { created: [{ ad_id: 'mock-ad-1' }], errors: [] } }];
