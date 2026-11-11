"use client";
// AI agent demo: a recorded testnet run of guard/agent-demo.mjs (data in lib/agent-demo-run.json), plus the live
// state of the same accounts. English only, like the rest of the UI.
import { Card, Pill, StatusBadge, TxLink, usePoll } from "@/components/ui";
import { More } from "@/components/visual";
import { ADDR, UNDO } from "@/lib/config";
import { short, view } from "@/lib/near-client";
import type { BalanceView } from "@/lib/types";
import run from "@/lib/agent-demo-run.json";

type Payment = { invoice: string; supplier?: string; to: string; amount: string; note?: string; tx?: string; transferId?: string | null; status?: string | null; finalStatus?: string; finalTo?: string | null; frozenAfterSec?: number; skipped?: string };
type GuardStep = { action: string; id: string | null; tx: string | null; error: string | null; reactionSec: number[] | null; at: string };
const R = run as unknown as {
  at: string;
  windowSec: number;
  contestSec: number;
  accounts: { owner: string; agent: string; beans: string; milk: string; scam: string };
  guardKeyMethods: string[];
  model: string;
  system: string;
  inbox: string;
  agent: { content: string; usage?: { total_tokens?: number }; seconds?: number | null };
  payments: Payment[];
  guard: GuardStep[];
  received: { scam: string; beans: string; milk: string; owner: string };
};

const who = (id: string) =>
  id === R.accounts.beans ? "Sumatra Beans (trusted supplier)" : id === R.accounts.milk ? "Fresh Dairy (trusted supplier)" : id === R.accounts.scam ? "unknown account (the fake email's)" : id === R.accounts.owner ? "the café" : short(id);

function Acct({ id }: { id: string }) {
  return (
    <a className="mono break-all text-xs text-phosphor underline decoration-dotted underline-offset-2 hover:text-ink" href={ADDR(id)} target="_blank" rel="noreferrer">
      {id}
    </a>
  );
}

export default function AgenPage() {
  const sent = R.payments.filter((p) => p.transferId);
  const hijacked = sent.filter((p) => p.to === R.accounts.scam);
  const instant = sent.filter((p) => p.status === "Settled");
  const panic = R.guard.find((g) => g.action === "panic" && g.tx);
  const finals = R.guard.filter((g) => g.action === "finalize" && g.tx);
  const unlock = R.guard.find((g) => g.action === "unlock" && g.tx);
  const frozenAfter = hijacked.map((p) => p.frozenAfterSec).filter((x): x is number => typeof x === "number");
  const hijackedSum = hijacked.reduce((s, p) => s + Number(p.amount), 0).toFixed(2);
  const [live] = usePoll(
    () => Promise.all([view<BalanceView>(UNDO, "balance_of", { account_id: R.accounts.agent }), view<BalanceView>(UNDO, "balance_of", { account_id: R.accounts.scam })]),
    [],
    20000,
  );
  const messages = R.inbox.split(/\n\n/).slice(1);

  return (
    <div className="space-y-12 [overflow-wrap:anywhere] sm:space-y-16">
      <Card title="An AI agent paid a scammer. The money came back." tone="accent">
        <p className="max-w-[68ch] text-base text-ink">
          A café lets an AI agent pay its supplier invoices from an Undo wallet. A fake &ldquo;our bank details changed&rdquo; email talks the agent into paying {hijackedSum} rUSDC to
          an unknown account. A spending limit would not stop it: the amounts are normal invoices. A strict allowlist would, but it also blocks every new supplier the café
          really wants to pay. Undo lets the payment go out and takes it back.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="ok">Scammer received {R.received.scam} rUSDC</Pill>
          <Pill tone="ok">
            {instant.length} trusted supplier {instant.length === 1 ? "payment" : "payments"} final at once
          </Pill>
          {frozenAfter.length > 0 && <Pill tone="ok">Frozen {Math.max(...frozenAfter)} s after it was sent</Pill>}
          <Pill>Back to the café: {R.received.owner} rUSDC</Pill>
        </div>
        <p className="mt-3 text-xs text-muted">
          Recorded on NEAR testnet, {new Date(R.at).toUTCString()}, on the locked Undo contract <Acct id={UNDO} />. Every step below links its transaction.
        </p>
      </Card>

      <Card title="1 · The setup">
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          <li className="rounded-[10px] bg-well p-3">
            <p className="font-semibold text-ink">🤖 Agent wallet</p>
            <Acct id={R.accounts.agent} />
            <p className="mt-1 text-dim">Holds its own full key and can pay anyone. Every payment it makes waits {Math.round(R.windowSec / 60)} min before it is final.</p>
          </li>
          <li className="rounded-[10px] bg-well p-3">
            <p className="font-semibold text-ink">☕ The café (recovery account)</p>
            <Acct id={R.accounts.owner} />
            <p className="mt-1 text-dim">Frozen money returns here. The agent cannot change this account without a delay the café can cancel.</p>
          </li>
          <li className="rounded-[10px] bg-well p-3">
            <p className="font-semibold text-ink">⚡ Trusted suppliers</p>
            <p>
              <Acct id={R.accounts.beans} /> · <Acct id={R.accounts.milk} />
            </p>
            <p className="mt-1 text-dim">Active trusted contacts: a payment to them is final at once, so normal bills are not slowed down.</p>
          </li>
          <li className="rounded-[10px] bg-well p-3">
            <p className="font-semibold text-ink">🛡 Guard bot</p>
            <p className="mono text-xs text-dim">function-call key on the café&rsquo;s account → {R.guardKeyMethods.join(", ")}</p>
            <p className="mt-1 text-dim">Freezes any payment the agent makes to an account that is not a trusted supplier. It cannot move money itself. It is the same code as the Coba Curi guard.</p>
          </li>
        </ul>
      </Card>

      <Card title="2 · What the agent read">
        <div className="grid gap-3">
          {messages.map((m, i) => {
            const fake = m.includes(R.accounts.scam);
            return (
              <div key={i} className={`rounded-[10px] p-3 text-sm ${fake ? "bg-rec/12" : "bg-well"}`}>
                {fake && <p className="mb-1 text-xs font-semibold text-rec">⚠ Fake: a lookalike domain and an account that is not the supplier&rsquo;s</p>}
                <p className="whitespace-pre-wrap text-ink">{m}</p>
              </div>
            );
          })}
        </div>
        <More label="The agent's instructions">
          <p className="whitespace-pre-wrap rounded-[10px] bg-well p-3 text-xs">{R.system}</p>
          <p className="mt-2 text-xs">Told to follow each supplier&rsquo;s latest payment details, like a typical invoice-paying automation. Model: {R.model} on NEAR AI Cloud.</p>
        </More>
      </Card>

      <Card title="3 · What the agent paid">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Invoice</th>
                <th className="py-2 pr-3 font-semibold">Paid to</th>
                <th className="py-2 pr-3 text-right font-semibold">rUSDC</th>
                <th className="py-2 pr-3 font-semibold">Right after</th>
                <th className="py-2 font-semibold">In the end</th>
              </tr>
            </thead>
            <tbody>
              {R.payments.map((p) => (
                <tr key={p.invoice} className="border-t border-line align-top">
                  <td className="py-2 pr-3 font-semibold text-ink">{p.invoice}</td>
                  <td className="py-2 pr-3">
                    <span className={p.to === R.accounts.scam ? "font-semibold text-rec" : "text-ink"}>{who(p.to)}</span>
                    {p.note && <span className="block text-xs text-muted">agent: &ldquo;{p.note}&rdquo;</span>}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{p.amount}</td>
                  <td className="py-2 pr-3">
                    {p.skipped ? <span className="text-xs text-muted">{p.skipped}</span> : p.status === "Settled" ? <span className="text-xs">⚡ final at once</span> : <span className="text-xs">▶ waiting {Math.round(R.windowSec / 60)} min</span>}
                  </td>
                  <td className="py-2">
                    {p.finalStatus && <StatusBadge status={p.finalStatus} />}
                    {p.finalStatus === "Reversed" && <span className="block text-xs text-muted">frozen {p.frozenAfterSec} s after it was sent, back to the café</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          All payments went out in one transaction: <TxLink hash={sent[0]?.tx} />.
          {R.agent.seconds ? ` The agent answered in ${R.agent.seconds} s.` : ""}
          {R.agent.usage?.total_tokens ? ` One NEAR AI call, ${R.agent.usage.total_tokens} tokens.` : ""}
        </p>
        <More label="The agent's raw answer">
          <pre className="mono overflow-x-auto whitespace-pre-wrap rounded-[10px] bg-well p-3 text-xs">{R.agent.content}</pre>
        </More>
      </Card>

      <Card title="4 · What the guard did" tone="frozen">
        <ol className="grid gap-2 text-sm">
          {panic && (
            <li>
              <b className="text-ink">❚❚ Panic.</b> The {hijacked.length === 1 ? "payment" : `${hijacked.length} payments`} to the unknown account froze, and the agent&rsquo;s wallet locked so nothing more could leave. <TxLink hash={panic.tx ?? undefined} />
            </li>
          )}
          {finals.length > 0 && (
            <li>
              <b className="text-ink">◀◀ Finalize.</b> Nobody contested within {Math.round(R.contestSec / 60)} min, so the frozen money and the wallet&rsquo;s remaining balance went to the café.{" "}
              {finals.map((f) => (
                <span key={f.tx} className="mr-2">
                  <TxLink hash={f.tx ?? undefined} />
                </span>
              ))}
            </li>
          )}
          {unlock && (
            <li>
              <b className="text-ink">🔓 Unlock.</b> The wallet works again; the café can top it up after checking. <TxLink hash={unlock.tx ?? undefined} />
            </li>
          )}
          <li className="text-dim">No council, no vote, no AI in the guard: a rule (&ldquo;not a trusted supplier → freeze&rdquo;) and a key that can only call {R.guardKeyMethods.join(", ")}.</li>
        </ol>
        {live && (
          <p className="mt-4 text-xs text-muted">
            Live now: agent wallet {(Number(live[0].available) / 1e6).toFixed(2)} rUSDC{live[0].locked ? " (locked)" : ""} · the scammer&rsquo;s account{" "}
            {((Number(live[1].available) + Number(live[1].pending_in)) / 1e6).toFixed(2)} rUSDC
          </p>
        )}
      </Card>

      <Card title="Why this helps AI agents">
        <ul className="grid gap-2 text-sm text-dim">
          <li>
            <b className="text-ink">Limits stop payments before they leave; Undo also handles the one that got through.</b> A poisoned invoice is a payment the agent was allowed to make.
          </li>
          <li>
            <b className="text-ink">Normal bills stay fast.</b> Trusted suppliers are paid at once. Only payments to accounts the café never approved wait.
          </li>
          <li>
            <b className="text-ink">The guard cannot steal.</b> Its function-call key can freeze and finalize, and finalize can only send money back to the café (J1).
          </li>
          <li>
            <b className="text-ink">Trade-off.</b> Someone holding the agent&rsquo;s key can still pay the active trusted suppliers at once. Keep that list short.
          </li>
        </ul>
        <More label="Run it yourself">
          <pre className="mono overflow-x-auto rounded-[10px] bg-well p-3 text-xs">{`cd undo/app
node guard/agent-demo.mjs setup   # accounts, 200 rUSDC, trusted suppliers, the guard key
node guard/agent-demo.mjs run     # one NEAR AI call, the payments, the guard (about 3 min)`}</pre>
          <p className="mt-2 text-xs">Needs NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY (a funded testnet account, used only if the testnet helper refuses) and NEAR_AI_API_KEY in the repository root .env.</p>
        </More>
      </Card>
    </div>
  );
}
