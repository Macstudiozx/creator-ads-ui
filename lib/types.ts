export type Role = 'viewer' | 'approver' | 'admin';

export type Account = {
  id?: string;
  brand: string;
  product?: string | null;
  account_label: string;
  act_id: string;
  page_ids?: string[];
  default_page_id?: string | null;
  pixel_id?: string | null;
  owner?: string | null;
  active?: boolean;
};

export type Shorthand = {
  id?: string;
  code: string;
  funnel: string;
  objective: string;
  optimization_goal: string;
  destination_type: string;
  regen_slot: string;
  allowed_funnels?: string[];
  active?: boolean;
};

export type Batch = { id: string; code: string; brand?: string; promo?: string; brand_tone?: string; status: string; created_at?: string };
export type ProgressEvent = { id?: number; batch_id: string; seq: number; event: string; payload: any; ts?: string };
export type Proposal = { id: string; batch_id: string; version: number; plan: any; summary: any; expires_at: string; created_at?: string };
export type Creative = { id: string; ad_code: string; product: string; account_label: string; funnel: string; shorthand: string; angle: string; topic?: string; format: string; version: string; caption: string; headline: string; status: string; media_path?: string; campaign_id?: string; adset_id?: string; ad_id?: string; ads_status?: string; source_agent?: string | null; external_ref?: string | null; feed_payload?: any; ingested_at?: string };
export type Result = { id: string; batch_id: string; status: string; detail: any; created_at?: string };
