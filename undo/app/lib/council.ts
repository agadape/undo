// The council is a Sputnik DAO: who sits on it, how many votes a decision needs, and its open proposals to
// `resolve` a dispute on the Undo contract. Shared by the /dewan page (browser) and the resolve route (server).
import { DAO, UNDO } from "./config";

export type ProposalKind = { FunctionCall?: { receiver_id: string; actions: { method_name: string; args: string; deposit: string; gas: string }[] } };
export type Proposal = {
  id: number;
  proposer: string;
  description: string;
  kind: ProposalKind;
  status: "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
};
export type ResolveProposal = Proposal & { transferId: string; reverse: boolean; reason: string };
export type Council = { members: string[]; needed: number; bond: string; proposals: ResolveProposal[] };

type View = <T>(contractId: string, method: string, args?: Record<string, unknown>) => Promise<T>;

const decode = (b64: string) => (typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8"));

/** A `resolve(transfer_id, reverse, reason)` proposal for the Undo contract, else null. */
export function asResolve(p: Proposal): ResolveProposal | null {
  const fc = p.kind.FunctionCall;
  const a = fc?.actions?.[0];
  if (!fc || fc.receiver_id !== UNDO || fc.actions.length !== 1 || a?.method_name !== "resolve") return null;
  try {
    const args = JSON.parse(decode(a.args)) as { transfer_id: string; reverse: boolean; reason: string };
    return { ...p, transferId: String(args.transfer_id), reverse: !!args.reverse, reason: args.reason ?? "" };
  } catch {
    return null;
  }
}

/** Members, the votes a decision needs (Sputnik: floor(members × ratio) + 1) and the latest resolve proposals. */
export async function loadCouncil(view: View, lookback = 40): Promise<Council> {
  const policy = await view<{
    roles: { name: string; kind: { Group?: string[] } | string; vote_policy: Record<string, { threshold: [number, number] | string }> }[];
    default_vote_policy: { threshold: [number, number] | string };
    proposal_bond: string;
  }>(DAO, "get_policy");
  const role = policy.roles.find((r) => r.name === "council");
  const members = role && typeof role.kind === "object" && role.kind.Group ? role.kind.Group : [];
  const vp = role?.vote_policy?.["*"] ?? policy.default_vote_policy;
  const ratio = Array.isArray(vp.threshold) ? vp.threshold : [1, 2];
  const needed = Math.min(members.length, Math.floor((members.length * ratio[0]) / ratio[1]) + 1);
  const last = await view<number>(DAO, "get_last_proposal_id");
  const from = Math.max(0, last - lookback);
  const raw = last > 0 ? await view<Proposal[]>(DAO, "get_proposals", { from_index: from, limit: lookback }) : [];
  const proposals = raw.map(asResolve).filter((p): p is ResolveProposal => !!p);
  return { members, needed, bond: policy.proposal_bond, proposals };
}

export const approvals = (p: Proposal) => Object.values(p.votes).filter((v) => v === "Approve").length;
export const rejections = (p: Proposal) => Object.values(p.votes).filter((v) => v === "Reject").length;
