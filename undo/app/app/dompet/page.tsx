"use client";
import { useEffect, useState } from "react";
import { useAccounts } from "@/components/accounts";
import { TransferList } from "@/components/transfers";
import { Cassette, type Disc } from "@/components/cassette";
import { Button, Card, Countdown, Notice, Pill, TxLink, inputClass, usePoll } from "@/components/ui";
import { ack, ackKey, contactAckKey } from "@/lib/alerts";
import { ADDR, UNDO, USDC } from "@/lib/config";
import { useAccountLabel, useFmt, useGasNote, useLang, useT } from "@/lib/i18n";
import { USD, call, createDemoAccount, parseOutcome, provider, short, view, type DemoAccount } from "@/lib/near-client";
import { More, NextStep, WindowBar } from "@/components/visual";
import { playTimeFx } from "@/lib/timefx";
import { walletBatch } from "@/lib/wallet";
import type { AccountView, BalanceView, Config, Contact, Transfer } from "@/lib/types";

export default function DompetPage() {
  const { accounts, active, ready } = useAccounts();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 15000);
  const t = useT();
  if (!ready) return null;
  if (accounts.length === 0 || !active) return <Setup />;
  if (!cfg) return <p className="text-sm text-muted">{t("memuat kontrak…", "loading contract…")}</p>;
  return <Wallet key={active.id} me={active} cfg={cfg} />;
}

// ---------- first run: one click creates a protected wallet + its recovery account ----------

/** Lines Setup writes to its log on success (two "creating" lines, two account ids, four contract calls): drives the progress bar. */
const SETUP_LINES = 8;

function Setup() {
  const { add, connectWallet, walletError } = useAccounts();
  const t = useT();
  const lang = useLang();
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const step = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    setError(undefined);
    setLog([]);
    try {
      step(t("Membuat dompet utama (akun testnet baru)…", "Creating the main wallet (new testnet account)…"));
      const main = await createDemoAccount("Dompet utama");
      step(`✓ ${main.id}`);
      step(t("Membuat akun pemulihan (bayangkan ini HP-mu)…", "Creating the recovery account (imagine it is your phone)…"));
      const rec = { ...(await createDemoAccount("Akun pemulihan (HP)")), recoveryFor: main.id };
      step(`✓ ${rec.id}`);
      const must = async (label: string, p: Promise<{ ok: boolean; error?: string }>) => {
        const r = await p;
        if (!r.ok) throw new Error(`${label}: ${r.error}`);
        step(`✓ ${label}`);
      };
      await must(t("Pasang akun pemulihan (langsung berlaku karena akun masih kosong)", "Set the recovery account (takes effect at once because the account is still empty)"), call(main, UNDO, "set_recovery", { recovery_id: rec.id }, { gasTera: "30" }));
      await must(t("Daftar ke USDC testnet", "Register with testnet USDC"), call(main, USDC, "storage_deposit", { account_id: main.id, registration_only: true }, { deposit: 1_250_000_000_000_000_000_000n, gasTera: "30" }));
      await must(t("Ambil 100 USDC testnet", "Get 100 testnet USDC"), call(main, USDC, "mint", { account_id: main.id, amount: USD(100) }, { gasTera: "30" }));
      await must(t("Bungkus 100 USDC → 100 rUSDC", "Wrap 100 USDC → 100 rUSDC"), call(main, USDC, "ft_transfer_call", { receiver_id: UNDO, amount: USD(100), msg: "" }, { deposit: 1n, gasTera: "100" }));
      add(rec);
      add(main, true);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <section>
        <h1 className="sr-only">{t("Dompet demo", "Demo wallet")}</h1>
        <div className="mx-auto max-w-[560px]">
          <Cassette decorative label={<span className="serif whitespace-nowrap text-[6.8cqw] leading-none">{t("Dompet demo", "Demo wallet")}</span>} />
        </div>
        {/* What one click creates: two accounts that belong together. */}
        <div className="mx-auto mt-2 grid max-w-lg grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="rounded-[14px] bg-panel p-4">
            <div className="font-semibold">{t("Dompet utama", "Main wallet")}</div>
            <div className="serif text-2xl text-sky">
              100 <span className="text-base">rUSDC</span>
            </div>
          </div>
          <span aria-hidden className="text-xl text-muted">
            ⇄
          </span>
          <div className="rounded-[14px] bg-panel p-4">
            <div className="font-semibold">📱 {t("Akun pemulihan", "Recovery account")}</div>
            <div className="text-sm font-semibold text-rec">{t("tombol PANIK", "the PANIC button")}</div>
          </div>
        </div>
        <p className="mt-4 text-sm text-dim">{t("Dua akun testnet sekali pakai. Kuncinya hanya di browser ini.", "Two throwaway testnet accounts. Keys stay in this browser.")}</p>
        {/* The whole demo in three moves, so the first click is not a leap of faith. */}
        <ol className="mx-auto mb-6 mt-6 grid max-w-lg grid-cols-3 gap-2 text-left">
          {[
            ["1", t("Siapkan", "Set up"), t("± 10 detik", "about 10 s"), "text-signal"],
            ["2", t("Simulasikan pencurian", "Simulate a theft"), t("90% saldo dikirim", "90% gets sent"), "text-rec"],
            ["3", t("Tekan PANIK", "Hit PANIC"), t("uangnya kembali", "money comes back"), "text-sky"],
          ].map(([n, a, b, c], i) => (
            <li key={n} className={`rounded-[12px] p-3 ${i === 0 ? "bg-signal/10 ring-1 ring-signal/40" : "bg-panel"}`}>
              <span className={`serif block text-2xl leading-none ${c}`}>{n}</span>
              <span className="mt-1 block text-sm font-semibold leading-tight text-ink">{a}</span>
              <span className="block text-xs leading-snug text-muted">{b}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={run}>{t("Siapkan dompet demo", "Set up demo wallet")}</Button>
          <Button variant="ghost" onClick={connectWallet}>
            {t("atau hubungkan wallet NEAR (testnet)", "or connect a NEAR wallet (testnet)")}
          </Button>
        </div>
        {walletError && <p className="mt-2 text-xs text-rec">{walletError}</p>}
        {log.length > 0 && !error && (
          <div className="mx-auto mt-5 max-w-lg" aria-hidden>
            <div className="flex justify-between text-xs font-semibold text-dim">
              <span>{log.length >= SETUP_LINES ? t("Siap!", "Ready!") : t("Menyiapkan di testnet…", "Setting up on testnet…")}</span>
              <span className="tabular-nums">{Math.round((Math.min(log.length, SETUP_LINES) / SETUP_LINES) * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raise">
              <div className="h-full rounded-full bg-sky transition-[width] duration-500" style={{ width: `${(Math.min(log.length, SETUP_LINES) / SETUP_LINES) * 100}%` }} />
            </div>
          </div>
        )}
        {log.length > 0 && (
          <ol className="mono mx-auto mt-3 max-w-lg space-y-1 rounded-[14px] bg-well p-4 text-left text-xs leading-5 text-sky" aria-live="polite">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        )}
        {error && (
          <div className="mx-auto mt-3 max-w-lg text-left">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- wallet ----------

function Wallet({ me, cfg }: { me: DemoAccount; cfg: Config }) {
  const { accounts, add, reset } = useAccounts();
  const t = useT();
  const fmt = useFmt();
  const accountLabel = useAccountLabel();
  const [bal, refreshBal] = usePoll(() => view<BalanceView>(UNDO, "balance_of", { account_id: me.id }), [me.id]);
  const [acct, refreshAcct] = usePoll(() => view<AccountView>(UNDO, "get_account", { account_id: me.id }), [me.id]);
  const [incoming, refreshIn] = usePoll(() => view<Transfer[]>(UNDO, "get_incoming", { account_id: me.id }), [me.id]);
  const [outgoing, refreshOut] = usePoll(() => view<Transfer[]>(UNDO, "get_outgoing", { account_id: me.id, limit: 20 }), [me.id]);
  // Trusted contacts exist only on v2 contracts (get_config has contact_delay_sec).
  const hasContacts = cfg.contact_delay_sec !== undefined;
  const [contacts, refreshContacts] = usePoll(() => (hasContacts ? view<Contact[]>(UNDO, "get_contacts", { account_id: me.id }) : Promise.resolve([] as Contact[])), [me.id, hasContacts], 10000);
  const refresh = () => {
    refreshBal();
    refreshAcct();
    refreshIn();
    refreshOut();
    refreshContacts();
  };
  const protectedId = me.recoveryFor;

  return (
    <div className="space-y-14 sm:space-y-20">
      <section aria-label={accountLabel(me.label)} className="text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <h1 className="serif text-2xl leading-tight sm:text-3xl">{accountLabel(me.label)}</h1>
          {bal?.locked && <Pill tone="danger">{t("TERKUNCI (Panik)", "LOCKED (Panic)")}</Pill>}
          {acct?.recovery ? <Pill tone="ok">{t("dilindungi akun pemulihan", "protected by a recovery account")}</Pill> : <Pill>{t("tanpa akun pemulihan", "no recovery account")}</Pill>}
        </div>
        <a className="mono mt-1 inline-block text-xs text-muted underline decoration-dotted underline-offset-2 hover:text-ink" href={ADDR(me.id)} target="_blank" rel="noreferrer">
          {me.id}
        </a>
        <WalletStage bal={bal} outgoing={outgoing} cfg={cfg} accounts={accounts} />
        {acct?.recovery && (
          <p className="mt-2 text-xs text-muted">
            {t(`Akun pemulihan: ${short(acct.recovery)} · kalah sengketa: ${acct.lost_disputes}`, `Recovery account: ${short(acct.recovery)} · disputes lost: ${acct.lost_disputes}`)}
          </p>
        )}
        {acct?.pending_recovery && (
          <div className="mx-auto mt-3 max-w-xl text-left">
            <Notice kind="info">
              {t(`⏳ Akun pemulihan akan diganti ke ${short(acct.pending_recovery[0])} (akun lama masih bisa membatalkan).`, `⏳ Recovery account changing to ${short(acct.pending_recovery[0])} (the old one can still cancel).`)}
            </Notice>
          </div>
        )}
      </section>

      {me.kind === "wallet" && acct && bal && (!acct.recovery || bal.available === "0") && (
        <WalletOnboarding
          me={me}
          hasRecovery={!!acct.recovery}
          pendingRecovery={acct.pending_recovery}
          existingGuard={accounts.find((a) => a.recoveryFor === me.id && a.kind !== "wallet")}
          empty={bal.available === "0" && bal.pending_in === "0"}
          onAdd={add}
          onDone={refresh}
        />
      )}

      {protectedId && <RecoveryPanel me={me} protectedId={protectedId} cfg={cfg} />}

      {(() => {
        const guard = accounts.find((a) => a.recoveryFor === me.id && a.kind !== "wallet" && a.id === acct?.recovery);
        return guard && bal ? <PanicTest me={me} guard={guard} cfg={cfg} accounts={accounts} bal={bal} outgoing={outgoing} onAdd={add} onDone={refresh} /> : null;
      })()}

      {/* Everything else sits in tabs, so the wallet is three blocks instead of eight stacked cards. */}
      <WalletTabs
        tabs={[
          {
            id: "send",
            icon: "↗",
            label: t("Kirim", "Send"),
            hint: t("Setiap transfer bisa dibatalkan selama jendelanya masih berjalan.", "Every transfer can be undone while its window is still running."),
            body: <SendCard me={me} cfg={cfg} accounts={accounts} available={bal?.available} contacts={contacts} canSimulateTheft={!!acct?.recovery} onDone={refresh} onAddAccount={add} />,
          },
          ...(hasContacts
            ? [{ id: "contacts", icon: "★", label: t("Kontak tepercaya", "Trusted contacts"), count: contacts?.length, hint: t("Kirim ke kontak aktif langsung final, tanpa jendela undo.", "Money to an active contact is final at once, with no undo window."), body: <ContactsCard me={me} cfg={cfg} accounts={accounts} contacts={contacts} locked={!!bal?.locked} onDone={refresh} /> }]
            : []),
          {
            id: "history",
            icon: "⏱",
            label: t("Riwayat", "History"),
            count: (incoming?.length ?? 0) + (outgoing?.length ?? 0) || undefined,
            hint: t("Laporkan penipuan, bantah pembekuan, atau finalisasi di sini.", "Report fraud, contest a freeze, or finalize from here."),
            body: (
              <Card>
                <div className="grid gap-8 md:grid-cols-2">
                  <TransferList title={t("Masuk", "Incoming")} items={incoming} me={me} cfg={cfg} mode="self" onDone={refresh} empty={t("Belum ada yang masuk.", "Nothing incoming yet.")} />
                  <TransferList title={t("Keluar", "Outgoing")} items={outgoing} me={me} cfg={cfg} mode="self" onDone={refresh} empty={t("Belum ada yang keluar.", "Nothing outgoing yet.")} />
                </div>
              </Card>
            ),
          },
          {
            id: "others",
            icon: "👥",
            label: t("Akun demo lain", "Other demo accounts"),
            hint: t("Buat Penjual atau Pencuri untuk mencoba skenario lain.", "Make a Seller or a Thief to try the other stories."),
            body: (
              <Card>
                <div className="flex flex-wrap gap-2">
                  <AddAccount label="Penjual / toko" onAdd={add} />
                  <AddAccount label="Pencuri" onAdd={add} />
                  <Button
                    small
                    variant="ghost"
                    onClick={() => {
                      if (confirm(t("Hapus semua akun demo dari browser ini? (akunnya tetap ada di testnet)", "Remove all demo accounts from this browser? (the accounts stay on testnet)"))) reset();
                    }}
                  >
                    {t("Hapus akun demo dari browser", "Remove demo accounts from this browser")}
                  </Button>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Tabs for the wallet's secondary tools. Remembers the last tab in this browser. */
function WalletTabs({ tabs }: { tabs: { id: string; label: string; icon?: string; count?: number; hint?: string; body: React.ReactNode }[] }) {
  const [cur, setCur] = useState(tabs[0].id);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("undo.wallet.tab");
      if (saved && tabs.some((x) => x.id === saved)) setCur(saved);
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pick = (id: string) => {
    setCur(id);
    try {
      localStorage.setItem("undo.wallet.tab", id);
    } catch {
      /* storage blocked */
    }
  };
  const active = tabs.find((x) => x.id === cur) ?? tabs[0];
  return (
    <section>
      <div role="tablist" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={x.id === active.id}
            aria-controls={`panel-${x.id}`}
            onClick={() => pick(x.id)}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${x.id === active.id ? "bg-ink text-tape" : "bg-panel text-dim hover:text-ink"}`}
          >
            {x.icon && <span aria-hidden>{x.icon}</span>}
            {x.label}
            {x.count ? (
              <span className={`rounded-full px-1.5 text-xs leading-5 tabular-nums ${x.id === active.id ? "bg-tape/15" : "bg-raise text-ink"}`}>{x.count}</span>
            ) : null}
          </button>
        ))}
      </div>
      {active.hint && <p className="-mt-2 mb-4 text-sm text-dim">{active.hint}</p>}
      <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>
        {active.body}
      </div>
    </section>
  );
}

/** The wallet as the cassette. The label shows the balance; each disc on the tape is a real outgoing transfer
 *  (its position = how far through its undo window it is); frost covers the glass while a panic holds the money. */
function WalletStage({ bal, outgoing, cfg, accounts }: { bal?: BalanceView; outgoing?: Transfer[]; cfg: Config; accounts: DemoAccount[] }) {
  const t = useT();
  const fmt = useFmt();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = BigInt(nowMs) * 1_000_000n;
  const list = outgoing ?? [];
  const thief = accounts.find((a) => a.label === "Pencuri")?.id;
  const running = list.filter((x) => x.kind !== "Sweep" && x.status === "Pending" && BigInt(x.unlock_at) > now);
  const frozen = list.filter((x) => x.status === "Frozen");
  const held = list.filter((x) => x.status === "Frozen" || x.status === "Disputed");
  const heldSum = held.reduce((s, x) => s + BigInt(x.amount), 0n);
  const nextFrozen = frozen.map((x) => x.frozen_until!).filter(Boolean).sort()[0];
  const nextUnlock = running.map((x) => x.unlock_at).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0];
  const locked = !!bal?.locked;
  const state = locked && frozen.length > 0 ? "pause" : running.length > 0 ? "play" : "stop";

  const progress = (from: string, to: string, at: bigint) => {
    const a = Number(BigInt(from) / 1_000_000n);
    const b = Number(BigInt(to) / 1_000_000n);
    return Math.max(0, Math.min(1, (Number(at / 1_000_000n) - a) / Math.max(1, b - a)));
  };
  const contestNs = BigInt(cfg.contest_window_sec) * 1_000_000_000n;
  const discs: Disc[] = [
    ...running.map((x) => ({ id: x.id, at: progress(x.created_at, x.unlock_at, now), tone: (x.to === thief ? "danger" : "pending") as Disc["tone"] })),
    ...frozen.map((x) => ({ id: x.id, at: x.frozen_until ? progress(x.created_at, x.unlock_at, BigInt(x.frozen_until) - contestNs) : 0.5, tone: "frozen" as const })),
  ];
  const secsLeft = (ns?: string) => (ns ? Math.max(0, Math.ceil(Number(BigInt(ns) - now) / 1e9)) : 0);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const waitLeft = secsLeft(nextFrozen);

  const label =
    state === "pause" ? (
      <span className="flex items-baseline gap-[2.4cqw] whitespace-nowrap">
        <span className="text-[2.6cqw] font-semibold text-ice">{t("Dibekukan", "Frozen")}</span>
        <span className="serif text-[6.8cqw] leading-none text-ice tabular-nums">
          {fmt(heldSum)} <span className="text-[3.2cqw]">rUSDC</span>
        </span>
      </span>
    ) : (
      <span className="flex items-baseline gap-[2.4cqw] whitespace-nowrap">
        <span className="text-[2.6cqw] font-semibold text-dim">{t("Bisa dipakai", "Available")}</span>
        <span className={`serif text-[6.8cqw] leading-none tabular-nums ${locked ? "text-ice" : "text-ink"}`}>
          {fmt(bal?.available)} <span className="text-[3.2cqw] text-dim">rUSDC</span>
        </span>
      </span>
    );

  return (
    <div className="mx-auto mt-2 max-w-[640px]">
      <Cassette
        state={state}
        discs={discs}
        label={label}
        timer={state === "pause" ? "❚❚ PAUSE" : state === "play" ? `▶ ${mmss(secsLeft(nextUnlock))}` : "■ STOP"}
      />
      {state === "pause" && nextFrozen ? (
        <div className="-mt-2 flex items-center justify-center gap-4 sm:-mt-4">
          <span aria-hidden className="ring" style={{ "--p": waitLeft / Number(cfg.contest_window_sec), "--ring": "3.25rem" } as React.CSSProperties} />
          <p className="text-left">
            <span className="serif block text-3xl leading-none text-ice tabular-nums">{waitLeft > 0 ? mmss(waitLeft) : t("siap", "ready")}</span>
            <span className="text-sm text-dim">
              {waitLeft > 0 ? t("lalu uangnya kembali ke akun pemulihan. Tanpa voting.", "then the money goes back to the recovery account. No vote.") : t("Tekan Finalisasi di bawah.", "Press Finalize below.")}
            </span>
          </p>
        </div>
      ) : null}
      {/* The other buckets as chips: one glance, no sentence to parse. Empty buckets fade back. */}
      <ul className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
        {(
          [
            ...(locked && state === "pause" ? [["◉", t("Bisa dipakai", "Available"), bal?.available, "text-ink"] as const] : []),
            ["▶", t("Masuk, pending", "Incoming, pending"), bal?.pending_in, "text-signal"],
            ["❚❚", t("Dibekukan", "Frozen"), bal?.frozen_in, "text-ice"],
            ["⚖", t("Dalam sengketa", "In dispute"), bal?.disputed_in, "text-plum"],
          ] as const
        ).map(([icon, name, raw, color]) => {
          const zero = !raw || raw === "0";
          return (
            <li key={name} className={`inline-flex items-center gap-2 rounded-full bg-panel px-3.5 py-1.5 ${zero ? "opacity-60" : ""}`}>
              <span aria-hidden className={`text-xs ${zero ? "text-muted" : color}`}>
                {icon}
              </span>
              <span className="text-dim">{name}</span>
              <b className={`tabular-nums ${zero ? "text-dim" : "text-ink"}`}>{fmt(raw)}</b>
            </li>
          );
        })}
      </ul>
      {heldSum > 0n && state !== "pause" && (
        <p className="mt-1 text-xs text-muted">
          {t(`❚❚ Ditahan: ${fmt(heldSum)} rUSDC keluar (${held.length} transfer) · Riwayat → Keluar`, `❚❚ On hold: ${fmt(heldSum)} rUSDC outgoing (${held.length} transfer(s)) · History → Outgoing`)}
        </p>
      )}
    </div>
  );
}

// Top-level on purpose: a component defined inside another remounts on every render (buttons vanish mid-click).
/** One stop on the drill's tape: a dot, a short name, one sentence, and its button. */
function Stop({ name, title, state, tone = "signal", pulse = true, children }: { name: string; title: string; state: "done" | "now" | "todo"; tone?: "signal" | "ice" | "rec"; pulse?: boolean; children?: React.ReactNode }) {
  const now = tone === "ice" ? "bg-ice text-tape shadow-[0_0_0_6px_#9fe8ff26]" : tone === "rec" ? "bg-rec text-white shadow-[0_0_0_6px_#ff3b5f26]" : "bg-signal text-tape shadow-[0_0_0_6px_#ffb22426]";
  return (
    <li aria-current={state === "now" ? "step" : undefined} className="relative flex min-w-0 gap-4 sm:flex-col sm:items-center sm:gap-3 sm:text-center">
      <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${state === "done" ? "bg-sky text-tape" : state === "now" ? now : "bg-raise text-muted"}`}>
        {state === "done" ? "✓" : ""}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-2 sm:items-center">
        <span>
          <span className={`block font-semibold ${state === "todo" ? "text-dim" : "text-ink"}`}>{name}</span>
          <span className={`block text-sm leading-snug ${state === "now" ? "text-dim" : "text-muted"}`}>{title}</span>
        </span>
        {/* The stop you are on gets a soft pulsing ring around its button, so the eye lands on it. */}
        {children && pulse && state === "now" ? (
          <span className={`now-cta self-start sm:self-center ${tone === "ice" ? "[--pulse:var(--color-ice)]" : tone === "rec" ? "[--pulse:var(--color-rec)]" : "[--pulse:var(--color-signal)]"}`}>{children}</span>
        ) : (
          children
        )}
      </span>
    </li>
  );
}

/** The whole stolen-key drill on one card: the recovery account's key is in this browser, so no account switching. */
function PanicTest({
  me,
  guard,
  cfg,
  accounts,
  bal,
  outgoing,
  onAdd,
  onDone,
}: {
  me: DemoAccount;
  guard: DemoAccount;
  cfg: Config;
  accounts: DemoAccount[];
  bal: BalanceView;
  outgoing: Transfer[] | undefined;
  onAdd: (a: DemoAccount) => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const fmt = useFmt();
  const gasNote = useGasNote();
  const [guardBal, refreshGuard] = usePoll(() => view<BalanceView>(UNDO, "balance_of", { account_id: guard.id }), [guard.id]);
  const [guardNear, refreshNear] = usePoll(() => provider.viewAccount({ accountId: guard.id }).then((a) => String(a.amount)), [guard.id], 10000);
  const nearText = guardNear ? (Number(BigInt(guardNear) / 10n ** 18n) / 1e6).toLocaleString(lang === "en" ? "en-US" : "id-ID", { maximumFractionDigits: 6 }) : "…";
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const fee = BigInt(cfg.storage_fee) > 0n ? BigInt(cfg.storage_fee) : 1n;
  const now = BigInt(Date.now()) * 1_000_000n;
  const stolen = outgoing?.filter((t) => t.kind !== "Sweep" && t.status === "Pending" && BigInt(t.unlock_at) > now) ?? [];
  const thiefId = accounts.find((a) => a.label === "Pencuri")?.id;
  const frozen = outgoing?.filter((t) => t.status === "Frozen") ?? [];
  // 3 s after frozen_until, so the relayer's own 2 s margin has passed too.
  const ready = frozen.filter((t) => t.frozen_until && BigInt(t.frozen_until) + 3_000_000_000n <= now);
  const nextFrozen = frozen.map((t) => t.frozen_until!).sort()[0];
  const report = (label: string, r: { ok: boolean; hash?: string; error?: string; gasless?: boolean }) => {
    setMsg(r.ok ? { kind: "ok", text: label + gasNote(r), hash: r.hash } : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash });
    onDone();
    refreshGuard();
    refreshNear();
  };

  async function steal() {
    let thief = accounts.find((a) => a.label === "Pencuri");
    if (!thief) {
      setMsg({ kind: "ok", text: t("Membuat akun pencuri demo…", "Creating the demo Thief account…") });
      try {
        thief = await createDemoAccount("Pencuri");
      } catch (e) {
        return setMsg({ kind: "error", text: String((e as Error)?.message ?? e) });
      }
      onAdd(thief);
    }
    const amount = (BigInt(bal.available) * 9n) / 10n;
    if (amount <= 0n) return setMsg({ kind: "error", text: t("saldo kosong", "balance is empty") });
    report(
      t(`“Pencuri” mengirim ${fmt(amount)} rUSDC. Masih pending — tekan PANIK.`, `“Thief” sent ${fmt(amount)} rUSDC. Still pending — press PANIC.`),
      await call(me, UNDO, "transfer", { receiver_id: thief.id, amount: amount.toString(), memo: "dicuri" }, { deposit: fee, gasTera: "50" }),
    );
  }
  async function panic() {
    const r = await call(guard, UNDO, "panic", { account_id: me.id }, { gasTera: "150" });
    if (r.ok) playTimeFx("stop");
    report(t("PANIK: transfer keluar dibekukan, akun dikunci, sisa saldo dibekukan menuju akun pemulihan.", "PANIC: outgoing transfers frozen, account locked, remaining balance frozen on its way to the recovery account."), r);
  }
  async function finalizeAll() {
    let last: { ok: boolean; hash?: string; error?: string; gasless?: boolean } = { ok: true };
    let done = 0;
    let allGasless = true;
    for (const t of ready) {
      last = await call(guard, UNDO, "finalize", { transfer_id: t.id }, { gasTera: "50" });
      if (!last.ok) break;
      done += 1;
      allGasless &&= !!last.gasless;
    }
    if (done > 0) playTimeFx("rewind");
    report(
      t(`Finalisasi ${done} dari ${ready.length} transfer tanpa voting: uangnya sekarang di akun pemulihan.`, `Finalized ${done} of ${ready.length} transfer(s) with no vote: the money is now in the recovery account.`),
      last.ok ? { ...last, gasless: allGasless } : last,
    );
  }
  async function unlock() {
    const r = await call(guard, UNDO, "unlock", { account_id: me.id }, { gasTera: "30" });
    if (r.ok) playTimeFx("play");
    report(t("Akun dibuka kembali.", "Account unlocked."), r);
  }
  const giveBack = async () =>
    report(
      t(
        `Akun pemulihan mengirim ${fmt(guardBal?.available)} rUSDC kembali ke dompet (pending ${cfg.window_sec} dtk).`,
        `The recovery account sent ${fmt(guardBal?.available)} rUSDC back to the wallet (pending ${cfg.window_sec} s).`,
      ),
      await call(guard, UNDO, "transfer", { receiver_id: me.id, amount: guardBal?.available ?? "0", memo: "dikembalikan" }, { deposit: fee, gasTera: "50" }),
    );

  const guardHas = guardBal ? BigInt(guardBal.available) > 0n : false;
  const stolenNow = stolen.some((x) => x.to === thiefId);
  // Where the drill is: 0 steal · 1 panic · 2 wait · 3 finalize · 4 unlock · 5 done.
  const stage = bal.locked ? (frozen.length > 0 ? (ready.length > 0 ? 3 : 2) : 4) : stolenNow ? 1 : guardHas ? 5 : 0;
  const soonestTheft = stolen
    .filter((x) => x.to === thiefId)
    .map((x) => x.unlock_at)
    .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1))[0];
  const empty = bal.available === "0" && !bal.locked;
  const guide =
    stage === 0 && empty
      ? { icon: "∅", tone: "signal" as const, title: t("Dompet ini kosong", "This wallet is empty"), sub: t("Kirim balik uang dari HP pemulihan di bawah, lalu mulai lagi.", "Send the money back from the recovery phone below, then start again.") }
      : stage === 0
        ? { icon: "🎯", tone: "signal" as const, title: t("Mulai latihan: tekan Simulasikan pencurian", "Start the drill: press Simulate theft"), sub: t("Pencuri pura-pura mengambil 90% saldo. Ini testnet, tidak ada yang hilang sungguhan.", "A pretend thief takes 90% of the balance. It's testnet, nothing real is lost.") }
        : stage === 1
          ? {
              icon: "🚨",
              tone: "rec" as const,
              title: t("Uang sedang dicuri — tekan PANIK sebelum final", "Money is being stolen — hit PANIC before it's final"),
              sub: <Countdown ns={soonestTheft} prefix={t("Final dalam ", "Final in ")} done={t("hampir final", "almost final")} />,
            }
          : stage === 2
            ? {
                icon: "❄",
                tone: "ice" as const,
                title: t("Dibekukan. Sekarang tunggu, tanpa voting", "Frozen. Now just wait, nobody has to vote"),
                sub: <Countdown ns={nextFrozen} prefix={t("Finalisasi terbuka dalam ", "Finalize opens in ")} done={t("sebentar lagi…", "any second…")} />,
              }
            : stage === 3
              ? { icon: "◀◀", tone: "ice" as const, title: t("Tekan Finalisasi: uangnya kembali", "Press Finalize: the money rewinds"), sub: t("Ke HP pemulihan, bukan ke pencuri.", "To the recovery phone, not to the thief.") }
              : stage === 4
                ? { icon: "🔓", tone: "sky" as const, title: t("Uang aman. Buka kunci dompet", "Money is safe. Unlock the wallet"), sub: t("Di dunia nyata: ganti kunci yang dicuri dulu.", "In real life: replace the stolen key first.") }
                : {
                    icon: "✓",
                    tone: "sky" as const,
                    title: t("Latihan selesai — uangmu kembali", "Drill done — your money came back"),
                    sub: t("Berikutnya: coba pengadilan penipuan. Kirim ke Penjual, lalu Riwayat → Laporkan penipuan.", "Next: try the fraud court. Send to the Seller, then History → Report fraud."),
                  };

  return (
    <Card title={t("Uji Tombol Panik", "Test the panic button")} tone={stage === 2 || stage === 3 ? "frozen" : "danger"} right={<span className="text-xs text-muted">📱 {short(guard.id)}</span>}>
      <div className="mb-7">
        <NextStep icon={guide.icon} tone={guide.tone} title={guide.title} sub={guide.sub} label={stage >= 5 ? t("Selesai", "Done") : t(`Langkah ${stage + 1} dari 5`, `Step ${stage + 1} of 5`)} />
      </div>
      {/* The drill as one tape with five stops; the stretch already travelled is blue. */}
      <ol className="relative grid gap-6 sm:grid-cols-5 sm:gap-3">
        <span aria-hidden className="absolute left-[10%] right-[10%] top-4 hidden h-1 rounded-full bg-raise sm:block" />
        <span aria-hidden className="absolute left-[10%] top-4 hidden h-1 rounded-full bg-sky transition-[width] duration-700 sm:block" style={{ width: `${Math.min(stage, 4) * 20}%` }} />
        <Stop name={t("Curi", "Steal")} title={t("Pura-pura kuncimu dicuri: 90% saldo dikirim ke Pencuri", "Pretend your key is stolen: 90% goes to a Thief")} state={stage >= 1 ? "done" : "now"} tone="rec">
          <Button small variant="danger" onClick={steal} disabled={bal.locked || bal.available === "0"}>
            {t("Simulasikan pencurian", "Simulate theft")}
          </Button>
        </Stop>
        <Stop name={t("Panik", "Panic")} title={t("HP pemulihan: tekan PANIK", "Recovery phone: hit PANIC")} state={stage >= 2 ? "done" : stage === 1 ? "now" : "todo"} tone="rec">
          <Button variant="danger" onClick={panic} disabled={bal.locked && stolen.length === 0}>
            {t("PANIK", "PANIC")}
          </Button>
        </Stop>
        <Stop name={t("Tunggu", "Wait")} title={t(`Tunggu ${cfg.contest_window_sec} dtk, lalu finalisasi — tanpa voting`, `Wait ${cfg.contest_window_sec} s, then finalize — no vote`)} state={stage >= 3 ? "done" : stage === 2 ? "now" : "todo"} tone="ice" pulse={false}>
          {frozen.length > 0 && ready.length === 0 && (
            <span className="flex items-center gap-2 text-xs text-ice">
              <WindowBar from={(BigInt(nextFrozen) - BigInt(cfg.contest_window_sec) * 1_000_000_000n).toString()} to={nextFrozen} tone="ice" />
              <Countdown ns={nextFrozen} />
            </span>
          )}
        </Stop>
        <Stop name={t("Finalisasi", "Finalize")} title={t("Uang kembali ke HP pemulihan", "The money goes back to the recovery phone")} state={stage >= 4 ? "done" : stage === 3 ? "now" : "todo"} tone="ice">
          <Button small onClick={finalizeAll} disabled={ready.length === 0}>
            {t("Finalisasi", "Finalize")} {ready.length > 0 ? `(${ready.length})` : ""}
          </Button>
        </Stop>
        <Stop name={t("Buka kunci", "Unlock")} title={t("Kunci sudah diganti? Buka kunci", "Key replaced? Unlock")} state={stage >= 5 ? "done" : stage === 4 ? "now" : "todo"}>
          <Button small variant="ghost" onClick={unlock} disabled={!bal.locked || frozen.length > 0}>
            {t("Buka kunci", "Unlock")}
          </Button>
        </Stop>
      </ol>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-well px-4 py-3">
        <span className="text-sm text-dim">
          {t("Opsional: kirim uangnya balik ke dompet", "Optional: send the money back")} ·{" "}
          <b className="text-sky tabular-nums">
            📱 {fmt(guardBal?.available)} <span className="normal-case">rUSDC</span>
          </b>
        </span>
        <Button small variant="ghost" onClick={giveBack} disabled={bal.locked || !guardBal || guardBal.available === "0"}>
          {t("Kirim balik", "Send back")}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted">
        {t(`⛽ Langkah 2–4 tanpa gas (relayer Undo, NEP-366) · NEAR akun pemulihan: ${nearText}`, `⛽ Steps 2–4 are gasless (Undo relayer, NEP-366) · recovery account NEAR: ${nearText}`)}
      </p>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
    </Card>
  );
}

function WalletOnboarding({
  me,
  hasRecovery,
  pendingRecovery,
  existingGuard,
  empty,
  onAdd,
  onDone,
}: {
  me: DemoAccount;
  hasRecovery: boolean;
  pendingRecovery: [string, string] | null;
  existingGuard?: DemoAccount;
  empty: boolean;
  onAdd: (a: DemoAccount, makeActive?: boolean) => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [recoveryId, setRecoveryId] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();

  async function protect(id: string) {
    const r = await call(me, UNDO, "set_recovery", { recovery_id: id }, { gasTera: "30" });
    setMsg(
      r.ok
        ? {
            kind: "ok",
            text: empty
              ? t("Akun pemulihan terpasang (langsung berlaku karena saldo masih kosong).", "Recovery account set (takes effect at once because the balance is still empty).")
              : t("Akun pemulihan dijadwalkan (berlaku setelah jeda).", "Recovery account scheduled (takes effect after a delay)."),
            hash: r.hash,
          }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    onDone();
  }

  async function protectWithDemo() {
    setMsg({ kind: "ok", text: t("Membuat akun pemulihan demo di browser ini…", "Creating a demo recovery account in this browser…") });
    const rec = { ...(await createDemoAccount("Pemulihan untuk wallet")), recoveryFor: me.id };
    onAdd(rec);
    await protect(rec.id);
  }

  async function fund() {
    try {
      const r = parseOutcome(
        await walletBatch(USDC, [
          { method: "storage_deposit", args: { account_id: me.id, registration_only: true }, deposit: 1_250_000_000_000_000_000_000n, gasTera: 20 },
          { method: "mint", args: { account_id: me.id, amount: USD(100) }, deposit: 0n, gasTera: 20 },
          { method: "ft_transfer_call", args: { receiver_id: UNDO, amount: USD(100), msg: "" }, deposit: 1n, gasTera: 100 },
        ]),
      );
      setMsg(
        r.ok
          ? { kind: "ok", text: t("100 USDC testnet diambil dan dibungkus jadi 100 rUSDC.", "Got 100 testnet USDC and wrapped it into 100 rUSDC."), hash: r.hash }
          : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
      );
    } catch (e) {
      setMsg({ kind: "error", text: String((e as Error).message ?? e).slice(0, 200) });
    }
    onDone();
  }

  return (
    <Card title={t("Siapkan wallet ini", "Set up this wallet")} tone="accent">
      <ol className="space-y-3 text-sm">
        <li>
          <b>{t("1. Pasang akun pemulihan", "1. Set a recovery account")}</b> {hasRecovery ? <Pill tone="ok">{t("sudah", "done")}</Pill> : pendingRecovery ? <Pill>{t("terjadwal", "scheduled")}</Pill> : null}
          {!hasRecovery && pendingRecovery && (
            <p className="mt-1 text-xs text-dim">
              {lang === "en" ? (
                <>
                  {short(pendingRecovery[0])} takes effect in <Countdown ns={pendingRecovery[1]} done="soon (reload the page)" />. After that the “Test the panic button” card appears.
                </>
              ) : (
                <>
                  {short(pendingRecovery[0])} berlaku dalam <Countdown ns={pendingRecovery[1]} done="sebentar lagi (muat ulang)" />. Setelah itu kartu “Uji Tombol Panik” muncul.
                </>
              )}
            </p>
          )}
          {!hasRecovery && !pendingRecovery && existingGuard && (
            <div className="mt-2">
              <Button small onClick={() => protect(existingGuard.id)}>
                {lang === "en" ? <>Set {short(existingGuard.id)} (the demo recovery account already created)</> : <>Pasang {short(existingGuard.id)} (akun pemulihan demo yang sudah dibuat)</>}
              </Button>
            </div>
          )}
          {!hasRecovery && !pendingRecovery && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                value={recoveryId}
                onChange={(e) => setRecoveryId(e.target.value.trim())}
                placeholder={t("akun-lainmu.testnet", "your-other-account.testnet")}
                className={`${inputClass} mono w-full text-xs sm:w-64`}
              />
              <Button small onClick={() => protect(recoveryId)} disabled={!recoveryId}>
                {t("Pasang", "Set")}
              </Button>
              {!existingGuard && (
                <Button small variant="ghost" onClick={protectWithDemo}>
                  {t("atau buat akun pemulihan demo", "or create a demo recovery account")}
                </Button>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-muted">
            {t("Pasang sebelum mengisi saldo: selagi kosong, langsung berlaku.", "Set it before adding funds: while empty, it applies at once.")}
          </p>
        </li>
        <li>
          <b>{t("2. Ambil 100 USDC testnet dan bungkus jadi rUSDC", "2. Get 100 testnet USDC and wrap it into rUSDC")}</b>
          <div className="mt-2">
            <Button small onClick={fund}>
              {t("Ambil & bungkus (1 persetujuan wallet)", "Get & wrap (1 wallet approval)")}
            </Button>
          </div>
        </li>
      </ol>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
    </Card>
  );
}

function AddAccount({ label, onAdd }: { label: string; onAdd: (a: DemoAccount) => void }) {
  const t = useT();
  const accountLabel = useAccountLabel();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      small
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onAdd(await createDemoAccount(label));
        } finally {
          setBusy(false);
        }
      }}
    >
      {t(`+ Buat akun “${label}”`, `+ Create “${accountLabel(label)}” account`)}
    </Button>
  );
}

function ContactsCard({
  me,
  cfg,
  accounts,
  contacts,
  locked,
  onDone,
}: {
  me: DemoAccount;
  cfg: Config;
  accounts: DemoAccount[];
  contacts: Contact[] | undefined;
  locked: boolean;
  onDone: () => void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const fee = BigInt(cfg.storage_fee) > 0n ? BigInt(cfg.storage_fee) : 1n;
  const minutes = Math.round((cfg.contact_delay_sec ?? 0) / 60);
  const others = accounts.filter((a) => a.id !== me.id && a.label !== "Pencuri" && a.recoveryFor !== me.id);

  async function add() {
    const contactId = id.trim();
    if (!contactId) return setMsg({ kind: "error", text: t("isi akun kontak", "enter the contact account") });
    const r = await call(me, UNDO, "add_contact", { contact_id: contactId }, { deposit: fee, gasTera: "30" });
    // Added from this form, so it is the owner: no "was this you?" alert for it.
    if (r.ok && r.value != null) ack([contactAckKey(me.id, contactId, String(r.value))]);
    setMsg(
      r.ok
        ? { kind: "ok", text: t(`Kontak ditambahkan; aktif dalam ${minutes} menit.`, `Contact added; active in ${minutes} min.`), hash: r.hash }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    if (r.ok) setId("");
    onDone();
  }

  async function remove(contactId: string) {
    const r = await call(me, UNDO, "remove_contact", { contact_id: contactId }, { gasTera: "30" });
    setMsg(r.ok ? { kind: "ok", text: t("Kontak dihapus.", "Contact removed."), hash: r.hash } : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash });
    onDone();
  }

  return (
    <Card title={t("Kontak tepercaya", "Trusted contacts")}>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-[2px] border border-signal/50 bg-signal/10 px-2 py-1 font-semibold text-signal">⚡ {t("Kontak aktif = langsung final", "Active contact = final at once")}</span>
        <span className="rounded-[2px] border border-line-2 bg-well px-2 py-1 font-semibold text-dim">⏳ {t(`Kontak baru menunggu ${minutes} menit`, `New contacts wait ${minutes} min`)}</span>
      </div>
      <div className="mb-3">
        <More>
          <p>
            {t(
              "Tidak ada jendela undo untuk kontak aktif, jadi pembayarannya tidak bisa dibatalkan. Cocok untuk toko langganan atau keluarga. Jeda untuk kontak baru membuat pencuri yang menambahkan dirinya harus menunggu, dan Panik membatalkan kontak yang belum aktif.",
              "There is no undo window for an active contact, so the payment cannot be undone. Good for a regular shop or family. The delay on new contacts makes a thief who adds himself wait, and panic cancels contacts that are not active yet.",
            )}
          </p>
        </More>
      </div>
      {contacts && contacts.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {contacts.map((c) => (
            <li key={c.contact} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="mono text-xs">{short(c.contact)}</span>
              {c.active || BigInt(c.active_at) <= BigInt(Date.now()) * 1_000_000n ? (
                <Pill tone="ok">{t("aktif", "active")}</Pill>
              ) : (
                <Pill>
                  <Countdown ns={c.active_at} prefix={t("aktif dalam ", "active in ")} done={t("aktif", "active")} />
                </Pill>
              )}
              <Button small variant="ghost" onClick={() => remove(c.contact)}>
                {t("Hapus", "Remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">{contacts === undefined ? t("memuat kontak…", "loading contacts…") : t("Belum ada kontak.", "No contacts yet.")}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-sm sm:w-auto">
          <span className="osd block text-base leading-5 text-muted">{t("Akun kontak", "Contact account")}</span>
          <input
            list="contact-candidates"
            value={id}
            placeholder={others[0]?.id ?? t("toko.testnet", "shop.testnet")}
            onChange={(e) => setId(e.target.value.trim())}
            className={`${inputClass} mono w-full text-xs sm:w-72`}
          />
          <datalist id="contact-candidates">
            {others.map((a) => (
              <option key={a.id} value={a.id} />
            ))}
          </datalist>
        </label>
        <Button onClick={add} disabled={locked}>
          {t("Tambah kontak", "Add contact")}
        </Button>
      </div>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
    </Card>
  );
}

function SendCard({
  me,
  cfg,
  accounts,
  available,
  contacts,
  canSimulateTheft,
  onDone,
  onAddAccount,
}: {
  me: DemoAccount;
  cfg: Config;
  accounts: DemoAccount[];
  available?: string;
  contacts?: Contact[];
  canSimulateTheft?: boolean;
  onDone: () => void;
  onAddAccount: (a: DemoAccount) => void;
}) {
  const t = useT();
  const fmt = useFmt();
  const accountLabel = useAccountLabel();
  // Suggest other people first; this wallet's own recovery account last.
  const others = accounts.filter((a) => a.id !== me.id).sort((a, b) => Number(a.recoveryFor === me.id) - Number(b.recoveryFor === me.id));
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("10");
  const [mode, setMode] = useState<"rusdc" | "usdc">("rusdc");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const fee = BigInt(cfg.storage_fee) > 0n ? BigInt(cfg.storage_fee) : 1n;
  const target = to || others[0]?.id || "";
  const contact = contacts?.find((c) => c.contact === target);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!contact || contact.active) return;
    const ms = Number(BigInt(contact.active_at) / 1_000_000n) - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => rerender((x) => x + 1), ms + 50);
    return () => clearTimeout(id);
  }, [contact?.active_at, contact?.active]);

  async function send() {
    const amt = Number(amount.replace(",", "."));
    if (!target || !(amt > 0)) return setMsg({ kind: "error", text: t("isi penerima dan jumlah", "enter a receiver and an amount") });
    const r =
      mode === "rusdc"
        ? await call(me, UNDO, "transfer", { receiver_id: target, amount: USD(amt) }, { deposit: fee, gasTera: "50" })
        : await call(me, UNDO, "send_usdc", { receiver_id: target, amount: USD(amt) }, { deposit: fee, gasTera: "50" });
    // Sent from this form, so it is the owner: no "was this you?" alert for it.
    if (r.ok && r.value != null) ack([ackKey(me.id, String(r.value))]);
    // Ask the contract what it did (a contact may have become active between polls).
    const sent = r.ok && r.value != null ? await view<Transfer | null>(UNDO, "get_transfer", { transfer_id: String(r.value) }).catch(() => null) : null;
    const instant = !!sent && sent.unlock_at === sent.created_at;
    setMsg(
      r.ok
        ? {
            kind: "ok",
            text: instant
              ? mode === "rusdc"
                ? t("Terkirim ke kontak tepercaya — langsung final", "Sent to a trusted contact — final at once")
                : t("Terkirim ke kontak tepercaya — USDC bisa langsung dicairkan", "Sent to a trusted contact — the USDC can be withdrawn at once")
              : t(`Terkirim — pending selama ${cfg.window_sec} detik`, `Sent — pending for ${cfg.window_sec} seconds`),
            hash: r.hash,
          }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    onDone();
  }

  async function simulateTheft() {
    let thief = accounts.find((a) => a.label === "Pencuri");
    if (!thief) {
      setMsg({ kind: "ok", text: t("Membuat akun pencuri…", "Creating the Thief account…") });
      try {
        thief = await createDemoAccount("Pencuri");
      } catch (e) {
        return setMsg({ kind: "error", text: String((e as Error)?.message ?? e) });
      }
      onAddAccount(thief);
    }
    const avail = BigInt(available ?? 0);
    const steal = (avail * 9n) / 10n;
    if (steal <= 0n) return setMsg({ kind: "error", text: t("saldo kosong", "balance is empty") });
    const r = await call(me, UNDO, "transfer", { receiver_id: thief.id, amount: steal.toString(), memo: "dicuri" }, { deposit: fee, gasTera: "50" });
    setMsg(
      r.ok
        ? {
            kind: "ok",
            text: t(
              `Pencuri memakai kunci dompet ini dan mengirim ${fmt(steal)} rUSDC ke ${short(thief.id)}. Uangnya masih pending — notifikasi muncul di atas: tekan “Bukan — PANIK”, atau pindah ke akun pemulihan dan tekan PANIK.`,
              `The thief used this wallet's key and sent ${fmt(steal)} rUSDC to ${short(thief.id)}. The money is still pending — an alert appears at the top: press “No — PANIC”, or switch to the recovery account and press PANIC.`,
            ),
            hash: r.hash,
          }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    onDone();
  }

  return (
    <Card title={t("Kirim", "Send")}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-sm sm:w-auto">
          <span className="osd block text-base leading-5 text-muted">{t("Penerima", "Receiver")}</span>
          <input
            list="demo-accounts"
            value={to}
            placeholder={others[0]?.id ?? t("akun.testnet", "account.testnet")}
            onChange={(e) => setTo(e.target.value.trim())}
            className={`${inputClass} mono w-full text-xs sm:w-72`}
          />
          <datalist id="demo-accounts">
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {accountLabel(a.label)}
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="osd block text-base leading-5 text-muted">{t("Jumlah", "Amount")}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-24`} />
        </label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "rusdc" | "usdc")} className={`${inputClass} text-sm`}>
          <option value="rusdc">{t("rUSDC (penerima pakai Undo)", "rUSDC (receiver uses Undo)")}</option>
          <option value="usdc">{t("USDC biasa (penerima siapa saja)", "plain USDC (any receiver)")}</option>
        </select>
        <Button onClick={send}>{t("Kirim", "Send")}</Button>
        {canSimulateTheft && (
          <Button variant="danger" onClick={simulateTheft} title={t("Mengirim 90% saldo ke akun 'Pencuri' memakai kunci dompet ini", "Sends 90% of the balance to the 'Thief' account using this wallet's key")}>
            {t("Simulasikan kunci dicuri", "Simulate a stolen key")}
          </Button>
        )}
      </div>
      {contact && (
        <p className="mt-2 text-xs">
          {contact.active || BigInt(contact.active_at) <= BigInt(Date.now()) * 1_000_000n ? (
            <span className="font-semibold text-signal">{t("⚡ Kontak tepercaya: pembayaran ini langsung final dan tidak bisa dibatalkan.", "⚡ Trusted contact: this payment is final at once and cannot be undone.")}</span>
          ) : (
            <span className="text-muted">
              {t("Kontak ini belum aktif (aktif dalam ", "This contact is not active yet (active in ")}
              <Countdown ns={contact.active_at} done={t("sekarang", "now")} />
              {t(`): pembayaran masih menunggu ${cfg.window_sec} detik.`, `): the payment still waits ${cfg.window_sec} seconds.`)}
            </span>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        {t(`⏱ Uang menunggu ${cfg.window_sec} dtk · biaya storage ${fmtNear(cfg.storage_fee)} NEAR`, `⏱ Money waits ${cfg.window_sec} s · storage fee ${fmtNear(cfg.storage_fee)} NEAR`)}
      </p>
      {msg && (
        <div className="mt-2">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
    </Card>
  );
}

const fmtNear = (yocto: string) => (Number(BigInt(yocto) / 10n ** 18n) / 1e6).toString();

function RecoveryPanel({ me, protectedId, cfg }: { me: DemoAccount; protectedId: string; cfg: Config }) {
  const t = useT();
  const fmt = useFmt();
  const gasNote = useGasNote();
  const [out, refresh] = usePoll(() => view<Transfer[]>(UNDO, "get_outgoing", { account_id: protectedId, limit: 20 }), [protectedId], 5000);
  const [acct, refreshAcct] = usePoll(() => view<AccountView>(UNDO, "get_account", { account_id: protectedId }), [protectedId], 5000);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const open = out?.filter((t) => (t.status === "Pending" && BigInt(t.unlock_at) > BigInt(Date.now()) * 1_000_000n) || t.status === "Frozen" || t.status === "Disputed");
  const hasContacts = cfg.contact_delay_sec !== undefined;
  const [contacts, refreshContacts] = usePoll(() => (hasContacts ? view<Contact[]>(UNDO, "get_contacts", { account_id: protectedId }) : Promise.resolve([] as Contact[])), [protectedId, hasContacts], 10000);

  async function cancelContact(contactId: string) {
    const r = await call(me, UNDO, "cancel_contact", { account_id: protectedId, contact_id: contactId }, { gasTera: "30" });
    setMsg(
      r.ok
        ? { kind: "ok", text: t(`Kontak ${short(contactId)} dihapus dari dompet utama.`, `Contact ${short(contactId)} removed from the main wallet.`) + gasNote(r), hash: r.hash }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    refreshContacts();
  }

  async function panic() {
    const r = await call(me, UNDO, "panic", { account_id: protectedId }, { gasTera: "150" });
    const v = r.value as { frozen?: string[]; swept?: string } | undefined;
    if (r.ok) playTimeFx("stop");
    setMsg(
      r.ok
        ? {
            kind: "ok",
            text: t(
              `Panik! ${v?.frozen?.length ?? 0} transfer keluar dibekukan, sisa ${fmt(v?.swept)} rUSDC dibekukan menuju akun ini. Tanpa bantahan dalam ${cfg.contest_window_sec} detik, tekan Finalisasi.`,
              `Panic! ${v?.frozen?.length ?? 0} outgoing transfer(s) frozen; the remaining ${fmt(v?.swept)} rUSDC is frozen on its way to this account. If nobody contests within ${cfg.contest_window_sec} seconds, press Finalize.`,
            ) + gasNote(r),
            hash: r.hash,
          }
        : { kind: "error", text: r.error ?? t("gagal", "failed"), hash: r.hash },
    );
    refresh();
    refreshAcct();
  }

  async function unlock() {
    const r = await call(me, UNDO, "unlock", { account_id: protectedId }, { gasTera: "30" });
    if (r.ok) playTimeFx("play");
    setMsg(r.ok ? { kind: "ok", text: t("Akun dibuka kembali.", "Account unlocked.") + gasNote(r), hash: r.hash } : { kind: "error", text: r.error ?? t("gagal", "failed") });
    refreshAcct();
  }

  return (
    <Card title={t(`Akun pemulihan untuk ${short(protectedId)}`, `Recovery account for ${short(protectedId)}`)} tone="danger" right={acct?.locked ? <Pill tone="danger">{t("terkunci", "locked")}</Pill> : null}>
      <p className="mb-3 text-sm font-semibold text-ink">
        🚨 {t("Kunci dompet utama dicuri? PANIK membekukan semua transfer keluar dan mengunci dompet.", "Main wallet key stolen? PANIC freezes every outgoing transfer and locks the wallet.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={panic}>
          {t("PANIK", "PANIC")}
        </Button>
        {acct?.locked && (
          <Button variant="ghost" onClick={unlock}>
            {t("Buka kunci (setelah kunci diganti)", "Unlock (after the key is replaced)")}
          </Button>
        )}
      </div>
      {msg && (
        <div className="mt-3">
          <Notice kind={msg.kind}>
            {msg.text} <TxLink hash={msg.hash} />
          </Notice>
        </div>
      )}
      {hasContacts && contacts && contacts.length > 0 && (
        <div className="mt-4">
          <h3 className="osd mb-1 text-xl leading-6 text-dim">{t("Kontak tepercaya dompet utama", "The main wallet's trusted contacts")}</h3>
          <ul className="space-y-1">
            {contacts.map((c) => (
              <li key={c.contact} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="mono text-xs">{short(c.contact)}</span>
                {c.active || BigInt(c.active_at) <= BigInt(Date.now()) * 1_000_000n ? (
                  <Pill tone="ok">{t("aktif", "active")}</Pill>
                ) : (
                  <Pill>
                    <Countdown ns={c.active_at} prefix={t("aktif dalam ", "active in ")} done={t("aktif", "active")} />
                  </Pill>
                )}
                <Button small variant="ghost" onClick={() => cancelContact(c.contact)} title={t("Akun pemulihan menghapus kontak ini tanpa Panik", "The recovery account removes this contact without a panic")}>
                  {t("Hapus kontak", "Remove contact")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <TransferList
          title={t("Transfer keluar yang masih bisa dihentikan", "Outgoing transfers you can still stop")}
          items={open}
          me={me}
          cfg={cfg}
          mode="recovery"
          onDone={() => {
            refresh();
            refreshAcct();
          }}
          onMessage={setMsg}
          empty={t("Tidak ada transfer keluar yang pending.", "No pending outgoing transfers.")}
        />
      </div>
    </Card>
  );
}
