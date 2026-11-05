"use client";
import { useEffect, useState } from "react";
import { useAccounts } from "@/components/accounts";
import { TransferList } from "@/components/transfers";
import { Button, Card, Countdown, Notice, Pill, TxLink, usePoll } from "@/components/ui";
import { ack, ackKey, contactAckKey } from "@/lib/alerts";
import { ADDR, UNDO, USDC } from "@/lib/config";
import { useAccountLabel, useFmt, useGasNote, useLang, useT } from "@/lib/i18n";
import { USD, call, createDemoAccount, parseOutcome, provider, short, view, type DemoAccount } from "@/lib/near-client";
import { walletBatch } from "@/lib/wallet";
import type { AccountView, BalanceView, Config, Contact, Transfer } from "@/lib/types";

export default function DompetPage() {
  const { accounts, active, ready } = useAccounts();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 15000);
  const t = useT();
  if (!ready) return null;
  if (accounts.length === 0 || !active) return <Setup />;
  if (!cfg) return <p className="text-sm text-stone-500">{t("memuat kontrak…", "loading contract…")}</p>;
  return <Wallet key={active.id} me={active} cfg={cfg} />;
}

// ---------- first run: one click creates a protected wallet + its recovery account ----------

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
    <div className="mx-auto max-w-xl space-y-4">
      <Card title={t("Dompet demo", "Demo wallet")}>
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
          {lang === "en" ? (
            <>
              One click creates two throwaway NEAR testnet accounts: a <b>main wallet</b> holding 100 rUSDC, and a <b>recovery account</b> (imagine it is on your phone). Their keys are stored only in this browser.
            </>
          ) : (
            <>
              Satu klik membuat dua akun NEAR testnet sekali pakai: <b>dompet utama</b> berisi 100 rUSDC, dan <b>akun pemulihan</b> (bayangkan di HP-mu). Kuncinya disimpan di browser ini saja.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={run}>{t("Siapkan dompet demo", "Set up demo wallet")}</Button>
          <Button variant="ghost" onClick={connectWallet}>
            {t("atau hubungkan wallet NEAR (testnet)", "or connect a NEAR wallet (testnet)")}
          </Button>
        </div>
        {walletError && <p className="mt-2 text-xs text-red-600">{walletError}</p>}
        {log.length > 0 && (
          <ol className="mono mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-300">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        )}
        {error && (
          <div className="mt-3">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </Card>
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
    <div className="space-y-4">
      <Card
        title={accountLabel(me.label)}
        right={
          <div className="flex items-center gap-2">
            {bal?.locked && <Pill tone="danger">{t("TERKUNCI (Panik)", "LOCKED (Panic)")}</Pill>}
            {acct?.recovery ? <Pill tone="ok">{t("dilindungi akun pemulihan", "protected by a recovery account")}</Pill> : <Pill>{t("tanpa akun pemulihan", "no recovery account")}</Pill>}
          </div>
        }
      >
        <a className="mono text-xs text-stone-500 underline" href={ADDR(me.id)} target="_blank" rel="noreferrer">
          {me.id}
        </a>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("Bisa dipakai", "Available")} value={fmt(bal?.available)} strong />
          <Stat label={t("Masuk, masih pending", "Incoming, still pending")} value={fmt(bal?.pending_in)} />
          <Stat label={t("Dibekukan", "Frozen")} value={fmt(bal?.frozen_in)} />
          <Stat label={t("Dalam sengketa", "In dispute")} value={fmt(bal?.disputed_in)} />
        </div>
        {(() => {
          // balance_of counts incoming money only; show this wallet's own outgoing money that is held.
          const held = (outgoing ?? []).filter((x) => x.status === "Frozen" || x.status === "Disputed");
          const sum = held.reduce((s, x) => s + BigInt(x.amount), 0n);
          return sum > 0n ? (
            <p className="mt-2 text-xs text-stone-500">
              {t(
                `Uang keluar yang sedang ditahan: ${fmt(sum)} rUSDC (${held.length} transfer dibekukan atau dalam sengketa; lihat Riwayat → Keluar).`,
                `Outgoing money on hold: ${fmt(sum)} rUSDC (${held.length} transfer(s) frozen or in dispute; see History → Outgoing).`,
              )}
            </p>
          ) : null;
        })()}
        {acct?.recovery && (
          <p className="mt-3 text-xs text-stone-500">
            {t(`Akun pemulihan: ${short(acct.recovery)} · kalah sengketa: ${acct.lost_disputes}`, `Recovery account: ${short(acct.recovery)} · disputes lost: ${acct.lost_disputes}`)}
          </p>
        )}
        {acct?.pending_recovery && (
          <Notice kind="info">
            {t(
              `Penggantian akun pemulihan ke ${short(acct.pending_recovery[0])} terjadwal (berlaku setelah jeda; akun pemulihan lama bisa membatalkan).`,
              `Change of recovery account to ${short(acct.pending_recovery[0])} is scheduled (takes effect after a delay; the old recovery account can cancel it).`,
            )}
          </Notice>
        )}
      </Card>

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

      {hasContacts && <ContactsCard me={me} cfg={cfg} accounts={accounts} contacts={contacts} locked={!!bal?.locked} onDone={refresh} />}

      <SendCard me={me} cfg={cfg} accounts={accounts} available={bal?.available} contacts={contacts} canSimulateTheft={!!acct?.recovery} onDone={refresh} onAddAccount={add} />


      <Card title={t("Riwayat", "History")}>
        <div className="grid gap-6 md:grid-cols-2">
          <TransferList title={t("Masuk", "Incoming")} items={incoming} me={me} cfg={cfg} mode="self" onDone={refresh} empty={t("Belum ada yang masuk.", "Nothing incoming yet.")} />
          <TransferList title={t("Keluar", "Outgoing")} items={outgoing} me={me} cfg={cfg} mode="self" onDone={refresh} empty={t("Belum ada yang keluar.", "Nothing outgoing yet.")} />
        </div>
      </Card>

      <Card title={t("Akun demo lain", "Other demo accounts")}>
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
    </div>
  );
}

// Top-level on purpose: a component defined inside another remounts on every render (buttons vanish mid-click).
function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${done ? "bg-emerald-600 text-white" : "bg-stone-200 dark:bg-stone-800"}`}>{done ? "✓" : n}</span>
      <span className="text-sm">{title}</span>
      {children}
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
  const panic = async () =>
    report(
      t("PANIK: transfer keluar dibekukan, akun dikunci, sisa saldo dibekukan menuju akun pemulihan.", "PANIC: outgoing transfers frozen, account locked, remaining balance frozen on its way to the recovery account."),
      await call(guard, UNDO, "panic", { account_id: me.id }, { gasTera: "150" }),
    );
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
    report(
      t(`Finalisasi ${done} dari ${ready.length} transfer tanpa voting: uangnya sekarang di akun pemulihan.`, `Finalized ${done} of ${ready.length} transfer(s) with no vote: the money is now in the recovery account.`),
      last.ok ? { ...last, gasless: allGasless } : last,
    );
  }
  const unlock = async () => report(t("Akun dibuka kembali.", "Account unlocked."), await call(guard, UNDO, "unlock", { account_id: me.id }, { gasTera: "30" }));
  const giveBack = async () =>
    report(
      t(
        `Akun pemulihan mengirim ${fmt(guardBal?.available)} rUSDC kembali ke dompet (pending ${cfg.window_sec} dtk).`,
        `The recovery account sent ${fmt(guardBal?.available)} rUSDC back to the wallet (pending ${cfg.window_sec} s).`,
      ),
      await call(guard, UNDO, "transfer", { receiver_id: me.id, amount: guardBal?.available ?? "0", memo: "dikembalikan" }, { deposit: fee, gasTera: "50" }),
    );

  return (
    <Card title={t("Uji Tombol Panik", "Test the panic button")} tone="danger" right={<span className="text-xs text-stone-500">{t("akun pemulihan:", "recovery account:")} {short(guard.id)}</span>}>
      <ol className="space-y-2">
        <Step n={1} title={t("Pura-pura kuncimu dicuri: kirim 90% saldo ke akun Pencuri", "Pretend your key was stolen: send 90% of the balance to the Thief account")} done={stolen.some((x) => x.to === thiefId) || frozen.length > 0 || bal.locked}>
          <Button small variant="danger" onClick={steal} disabled={bal.locked || bal.available === "0"}>
            {t("Simulasikan pencurian", "Simulate theft")}
          </Button>
        </Step>
        <Step n={2} title={t("Dari akun pemulihan (HP): tekan PANIK", "From the recovery account (phone): press PANIC")} done={bal.locked}>
          <Button small variant="danger" onClick={panic} disabled={bal.locked && stolen.length === 0}>
            {t("PANIK", "PANIC")}
          </Button>
        </Step>
        <Step
          n={3}
          title={t(`Tunggu ${cfg.contest_window_sec} dtk tanpa bantahan, lalu finalisasi (tanpa voting)`, `Wait ${cfg.contest_window_sec} s with no contest, then finalize (no vote)`)}
          done={bal.locked && frozen.length === 0}
        >
          {frozen.length > 0 && ready.length === 0 && (
            <span className="text-xs text-stone-500">
              {lang === "en" ? (
                <>
                  can be finalized in <Countdown ns={nextFrozen} />
                </>
              ) : (
                <>
                  bisa difinalisasi dalam <Countdown ns={nextFrozen} />
                </>
              )}
            </span>
          )}
          <Button small onClick={finalizeAll} disabled={ready.length === 0}>
            {t("Finalisasi", "Finalize")} {ready.length > 0 ? `(${ready.length})` : ""}
          </Button>
        </Step>
        <Step n={4} title={t("Setelah kunci dompet diganti: buka kunci", "After the wallet key is replaced: unlock")} done={!bal.locked && (guardBal ? BigInt(guardBal.available) > 0n : false)}>
          <Button small variant="ghost" onClick={unlock} disabled={!bal.locked || frozen.length > 0}>
            {t("Buka kunci", "Unlock")}
          </Button>
        </Step>
        <Step n={5} title={t("Opsional: kirim saldo akun pemulihan kembali ke dompet", "Optional: send the recovery account's balance back to the wallet")} done={false}>
          <span className="text-xs text-stone-500">
            {t(`akun pemulihan memegang ${fmt(guardBal?.available)} rUSDC`, `the recovery account holds ${fmt(guardBal?.available)} rUSDC`)}
          </span>
          <Button small variant="ghost" onClick={giveBack} disabled={bal.locked || !guardBal || guardBal.available === "0"}>
            {t("Kirim balik", "Send back")}
          </Button>
        </Step>
      </ol>
      <p className="mt-3 text-xs text-stone-500">
        {t(
          `NEAR akun pemulihan: ${nearText}. Langkah 2–4 (Panik, finalisasi, buka kunci) dikirim lewat relayer Undo (meta-transaction NEP-366), jadi langkah itu tidak mengurangi NEAR ini. Langkah 5 transfer biasa dan memakai gas sendiri.`,
          `Recovery account NEAR: ${nearText}. Steps 2–4 (panic, finalize, unlock) go through the Undo relayer (NEP-366 meta-transaction), so they do not use this NEAR. Step 5 is a normal transfer and pays its own gas.`,
        )}
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
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
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
                className="mono w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs sm:w-64 dark:border-stone-700 dark:bg-stone-950"
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
          <p className="mt-1 text-xs text-stone-500">
            {t(
              "Pasang sebelum mengisi saldo: selagi akun kosong, akun pemulihan langsung berlaku. Setelah ada saldo, penggantian selalu lewat jeda.",
              "Set it before adding funds: while the account is empty, the recovery account takes effect at once. Once there is a balance, any change always goes through a delay.",
            )}
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

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-stone-50 p-3 dark:bg-stone-950">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`tabular-nums ${strong ? "text-2xl font-semibold" : "text-lg"}`}>{value}</div>
    </div>
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
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
        {t(
          `Pembayaran ke kontak yang sudah aktif langsung final, tanpa jendela undo, jadi tidak bisa dibatalkan. Cocok untuk toko langganan atau keluarga. Kontak baru aktif setelah ${minutes} menit, supaya pencuri yang menambahkan dirinya harus menunggu; Panik membatalkan kontak yang belum aktif.`,
          `Payments to an active contact are final at once, with no undo window, so they cannot be undone. Good for a regular shop or family. A new contact becomes active after ${minutes} min, so a thief who adds himself has to wait; panic cancels contacts that are not active yet.`,
        )}
      </p>
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
        <p className="mb-3 text-sm text-stone-500">{contacts === undefined ? t("memuat kontak…", "loading contacts…") : t("Belum ada kontak.", "No contacts yet.")}</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-sm sm:w-auto">
          <span className="block text-xs text-stone-500">{t("Akun kontak", "Contact account")}</span>
          <input
            list="contact-candidates"
            value={id}
            placeholder={others[0]?.id ?? t("toko.testnet", "shop.testnet")}
            onChange={(e) => setId(e.target.value.trim())}
            className="mono w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs sm:w-72 dark:border-stone-700 dark:bg-stone-950"
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
          <span className="block text-xs text-stone-500">{t("Penerima", "Receiver")}</span>
          <input
            list="demo-accounts"
            value={to}
            placeholder={others[0]?.id ?? t("akun.testnet", "account.testnet")}
            onChange={(e) => setTo(e.target.value.trim())}
            className="mono w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs sm:w-72 dark:border-stone-700 dark:bg-stone-950"
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
          <span className="block text-xs text-stone-500">{t("Jumlah", "Amount")}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-950" />
        </label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "rusdc" | "usdc")} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950">
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
            <span className="text-amber-700 dark:text-amber-300">{t("⚡ Kontak tepercaya: pembayaran ini langsung final dan tidak bisa dibatalkan.", "⚡ Trusted contact: this payment is final at once and cannot be undone.")}</span>
          ) : (
            <span className="text-stone-500">
              {t("Kontak ini belum aktif (aktif dalam ", "This contact is not active yet (active in ")}
              <Countdown ns={contact.active_at} done={t("sekarang", "now")} />
              {t(`): pembayaran masih menunggu ${cfg.window_sec} detik.`, `): the payment still waits ${cfg.window_sec} seconds.`)}
            </span>
          )}
        </p>
      )}
      <p className="mt-2 text-xs text-stone-500">
        {t(
          `Biaya storage ${fmtNear(cfg.storage_fee)} NEAR per transfer. Uang masuk pending ${cfg.window_sec} detik di kontrak demo ini.`,
          `Storage fee: ${fmtNear(cfg.storage_fee)} NEAR per transfer. Incoming money stays pending for ${cfg.window_sec} seconds in this demo contract.`,
        )}
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
    setMsg(r.ok ? { kind: "ok", text: t("Akun dibuka kembali.", "Account unlocked.") + gasNote(r), hash: r.hash } : { kind: "error", text: r.error ?? t("gagal", "failed") });
    refreshAcct();
  }

  return (
    <Card title={t(`Akun pemulihan untuk ${short(protectedId)}`, `Recovery account for ${short(protectedId)}`)} tone="danger" right={acct?.locked ? <Pill tone="danger">{t("terkunci", "locked")}</Pill> : null}>
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
        {t(
          "Kalau kunci dompet utama dicuri, tekan Panik: semua transfer keluar yang masih pending dibekukan, akun dikunci, dan sisa saldonya ikut dibekukan menuju akun ini.",
          "If the main wallet's key is stolen, press PANIC: all pending outgoing transfers are frozen, the account is locked, and its remaining balance is also frozen on its way to this account.",
        )}
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
          <h3 className="mb-1 text-sm font-semibold">{t("Kontak tepercaya dompet utama", "The main wallet's trusted contacts")}</h3>
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
          title={t("Transfer keluar dari dompet utama yang masih bisa dibatalkan atau sedang dibekukan", "Outgoing transfers from the main wallet that can still be cancelled or are frozen")}
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
