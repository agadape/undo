// Shapes returned by the undo-token contract views (v1; v2 adds trusted contacts).
export type Kind = "Transfer" | "Exit" | "Sweep";
export type Status = "Pending" | "Frozen" | "Disputed" | "Settled" | "Reversed";

export type Recommendation = {
  rekomendasi: string;
  confidence: number;
  curiga_injeksi: boolean;
  alasan_publik: string;
  model_id: string;
  response_hash: string;
};

export type Dispute = {
  origin: "Report" | "Contest";
  opened_by: string;
  wants_reverse: boolean;
  fallback_reverse: boolean;
  reason: string;
  bond: string;
  opened_at: string;
  evidence_deadline: string;
  case_nonce: string;
  evidence_sender: string | null;
  evidence_receiver: string | null;
  recommendation: Recommendation | null;
  decided_by: string | null;
  council_reason: string | null;
};

export type Transfer = {
  id: string;
  kind: Kind;
  from: string;
  to: string;
  amount: string;
  memo: string | null;
  created_at: string;
  unlock_at: string;
  status: Status;
  frozen_until: string | null;
  dispute: Dispute | null;
  final_to: string | null;
};

export type BalanceView = {
  available: string;
  pending_in: string;
  frozen_in: string;
  disputed_in: string;
  pending_exit: string;
  locked: boolean;
};

export type AccountView = {
  recovery: string | null;
  pending_recovery: [string, string] | null;
  locked: boolean;
  lost_disputes: number;
};

export type Config = {
  underlying: string;
  council: string;
  window_sec: number;
  contest_window_sec: number;
  evidence_window_sec: number;
  dispute_timeout_sec: number;
  recovery_delay_sec: number;
  /** v2 only: trusted contacts become active after this delay. */
  contact_delay_sec?: number;
  bond: string;
  storage_fee: string;
  total_supply: string;
  next_id: string;
  court: { model_id: string; signer: string | null; signer_x25519: string; prompt_sha256: string | null; max_tokens: number };
};

/** v2: a trusted contact. Payments to an active contact are final at once. */
export type Contact = { contact: string; active_at: string; active: boolean };
