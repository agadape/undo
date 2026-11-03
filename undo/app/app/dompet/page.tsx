"use client";
import { useState } from "react";
import { useAccounts } from "@/components/accounts";
import { TransferList } from "@/components/transfers";
import { Button, Card, Countdown, Notice, Pill, TxLink, usePoll } from "@/components/ui";
import { ADDR, UNDO, USDC } from "@/lib/config";
import { USD, call, createDemoAccount, fmt, parseOutcome, short, view, type DemoAccount } from "@/lib/near-client";
import { walletBatch } from "@/lib/wallet";
import type { AccountView, BalanceView, Config, Transfer } from "@/lib/types";

export default function DompetPage() {
  const { accounts, active, ready } = useAccounts();
  const [cfg] = usePoll(() => view<Config>(UNDO, "get_config"), [], 15000);
  if (!ready) return null;
  if (accounts.length === 0 || !active) return <Setup />;
  if (!cfg) return <p className="text-sm text-stone-500">memuat kontrak…</p>;
  return <Wallet me={active} cfg={cfg} />;
}

// ---------- first run: one click creates a protected wallet + its recovery account ----------

function Setup() {
  const { add, connectWallet, walletError } = useAccounts();
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const step = (s: string) => setLog((l) => [...l, s]);

  async function run() {
    setError(undefined);
    setLog([]);
    try {
      step("Membuat dompet utama (akun testnet baru)…");
      const main = await createDemoAccount("Dompet utama");
      step(`✓ ${main.id}`);
      step("Membuat akun pemulihan (bayangkan ini HP-mu)…");
      const rec = { ...(await createDemoAccount("Akun pemulihan (HP)")), recoveryFor: main.id };
      step(`✓ ${rec.id}`);
      const must = async (label: string, p: Promise<{ ok: boolean; error?: string }>) => {
        const r = await p;
        if (!r.ok) throw new Error(`${label}: ${r.error}`);
        step(`✓ ${label}`);
      };
      await must("Pasang akun pemulihan (langsung berlaku karena akun masih kosong)", call(main, UNDO, "set_recovery", { recovery_id: rec.id }, { gasTera: "30" }));
      await must("Daftar ke USDC testnet", call(main, USDC, "storage_deposit", { account_id: main.id, registration_only: true }, { deposit: 1_250_000_000_000_000_000_000n, gasTera: "30" }));
      await must("Ambil 100 USDC testnet", call(main, USDC, "mint", { account_id: main.id, amount: USD(100) }, { gasTera: "30" }));
      await must("Bungkus 100 USDC → 100 rUSDC", call(main, USDC, "ft_transfer_call", { receiver_id: UNDO, amount: USD(100), msg: "" }, { deposit: 1n, gasTera: "100" }));
      add(rec);
      add(main, true);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card title="Dompet demo">
        <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
          Satu klik membuat dua akun NEAR testnet sekali pakai: <b>dompet utama</b> berisi 100 rUSDC, dan <b>akun pemulihan</b> (bayangkan di HP-mu). Kuncinya disimpan di browser ini saja.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={run}>Siapkan dompet demo</Button>
          <Button variant="ghost" onClick={connectWallet}>
            atau hubungkan wallet NEAR (testnet)
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
  const [bal, refreshBal] = usePoll(() => view<BalanceView>(UNDO, "balance_of", { account_id: me.id }), [me.id]);
  const [acct, refreshAcct] = usePoll(() => view<AccountView>(UNDO, "get_account", { account_id: me.id }), [me.id]);
  const [incoming, refreshIn] = usePoll(() => view<Transfer[]>(UNDO, "get_incoming", { account_id: me.id }), [me.id]);
  const [outgoing, refreshOut] = usePoll(() => view<Transfer[]>(UNDO, "get_outgoing", { account_id: me.id, limit: 20 }), [me.id]);
  const refresh = () => {
    refreshBal();
    refreshAcct();
    refreshIn();
    refreshOut();
  };
  const protectedId = me.recoveryFor;

  return (
    <div className="space-y-4">
      <Card
        title={me.label}
        right={
          <div className="flex items-center gap-2">
            {bal?.locked && <Pill tone="danger">TERKUNCI (Panik)</Pill>}
            {acct?.recovery ? <Pill tone="ok">dilindungi akun pemulihan</Pill> : <Pill>tanpa akun pemulihan</Pill>}
          </div>
        }
      >
        <a className="mono text-xs text-stone-500 underline" href={ADDR(me.id)} target="_blank" rel="noreferrer">
          {me.id}
        </a>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Bisa dipakai" value={fmt(bal?.available)} strong />
          <Stat label="Masuk, masih pending" value={fmt(bal?.pending_in)} />
          <Stat label="Dibekukan" value={fmt(bal?.frozen_in)} />
          <Stat label="Dalam sengketa" value={fmt(bal?.disputed_in)} />
        </div>
        {acct?.recovery && <p className="mt-3 text-xs text-stone-500">Akun pemulihan: {short(acct.recovery)} · kalah sengketa: {acct.lost_disputes}</p>}
        {acct?.pending_recovery && (
          <Notice kind="info">
            Penggantian akun pemulihan ke {short(acct.pending_recovery[0])} terjadwal (berlaku setelah jeda; akun pemulihan lama bisa membatalkan).
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

      <SendCard me={me} cfg={cfg} accounts={accounts} available={bal?.available} onDone={refresh} onAddAccount={add} />


      <Card title="Riwayat">
        <div className="grid gap-6 md:grid-cols-2">
          <TransferList title="Masuk" items={incoming} me={me} cfg={cfg} mode="self" onDone={refresh} empty="Belum ada yang masuk." />
          <TransferList title="Keluar" items={outgoing} me={me} cfg={cfg} mode="self" onDone={refresh} empty="Belum ada yang keluar." />
        </div>
      </Card>

      <Card title="Akun demo lain">
        <div className="flex flex-wrap gap-2">
          <AddAccount label="Penjual / toko" onAdd={add} />
          <AddAccount label="Pencuri" onAdd={add} />
          <Button
            small
            variant="ghost"
            onClick={() => {
              if (confirm("Hapus semua akun demo dari browser ini? (akunnya tetap ada di testnet)")) reset();
            }}
          >
            Hapus akun demo dari browser
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
  const [guardBal, refreshGuard] = usePoll(() => view<BalanceView>(UNDO, "balance_of", { account_id: guard.id }), [guard.id]);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const fee = BigInt(cfg.storage_fee) > 0n ? BigInt(cfg.storage_fee) : 1n;
  const now = BigInt(Date.now()) * 1_000_000n;
  const stolen = outgoing?.filter((t) => t.kind !== "Sweep" && t.status === "Pending" && BigInt(t.unlock_at) > now) ?? [];
  const frozen = outgoing?.filter((t) => t.status === "Frozen") ?? [];
  const ready = frozen.filter((t) => t.frozen_until && BigInt(t.frozen_until) <= now);
  const nextFrozen = frozen.map((t) => t.frozen_until!).sort()[0];
  const report = (label: string, r: { ok: boolean; hash?: string; error?: string }) => {
    setMsg(r.ok ? { kind: "ok", text: label, hash: r.hash } : { kind: "error", text: r.error ?? "gagal", hash: r.hash });
    onDone();
    refreshGuard();
  };

  async function steal() {
    let thief = accounts.find((a) => a.label === "Pencuri");
    if (!thief) {
      setMsg({ kind: "ok", text: "Membuat akun pencuri demo…" });
      thief = await createDemoAccount("Pencuri");
      onAdd(thief);
    }
    const amount = (BigInt(bal.available) * 9n) / 10n;
    if (amount <= 0n) return setMsg({ kind: "error", text: "saldo kosong" });
    report(`“Pencuri” mengirim ${fmt(amount)} rUSDC. Masih pending — tekan PANIK.`, await call(me, UNDO, "transfer", { receiver_id: thief.id, amount: amount.toString(), memo: "dicuri" }, { deposit: fee, gasTera: "50" }));
  }
  const panic = async () => report("PANIK: transfer keluar dibekukan, akun dikunci, sisa saldo dibekukan menuju akun pemulihan.", await call(guard, UNDO, "panic", { account_id: me.id }, { gasTera: "150" }));
  async function finalizeAll() {
    let last: { ok: boolean; hash?: string; error?: string } = { ok: true };
    for (const t of ready) {
      last = await call(guard, UNDO, "finalize", { transfer_id: t.id }, { gasTera: "50" });
      if (!last.ok) break;
    }
    report(`Finalisasi ${ready.length} transfer tanpa voting: uangnya sekarang di akun pemulihan.`, last);
  }
  const unlock = async () => report("Akun dibuka kembali.", await call(guard, UNDO, "unlock", { account_id: me.id }, { gasTera: "30" }));
  const giveBack = async () =>
    report(
      `Akun pemulihan mengirim ${fmt(guardBal?.available)} rUSDC kembali ke dompet (pending ${cfg.window_sec} dtk).`,
      await call(guard, UNDO, "transfer", { receiver_id: me.id, amount: guardBal?.available ?? "0", memo: "dikembalikan" }, { deposit: fee, gasTera: "50" }),
    );

  return (
    <Card title="Uji Tombol Panik" tone="danger" right={<span className="text-xs text-stone-500">akun pemulihan: {short(guard.id)}</span>}>
      <ol className="space-y-2">
        <Step n={1} title="Pura-pura kuncimu dicuri: kirim 90% saldo ke akun Pencuri" done={stolen.length > 0 || frozen.length > 0 || bal.locked}>
          <Button small variant="danger" onClick={steal} disabled={bal.locked || bal.available === "0"}>
            Simulasikan pencurian
          </Button>
        </Step>
        <Step n={2} title="Dari akun pemulihan (HP): tekan PANIK" done={bal.locked}>
          <Button small variant="danger" onClick={panic} disabled={bal.locked && stolen.length === 0}>
            PANIK
          </Button>
        </Step>
        <Step n={3} title={`Tunggu ${cfg.contest_window_sec} dtk tanpa bantahan, lalu finalisasi (tanpa voting)`} done={bal.locked && frozen.length === 0}>
          {frozen.length > 0 && ready.length === 0 && (
            <span className="text-xs text-stone-500">
              bisa difinalisasi dalam <Countdown ns={nextFrozen} />
            </span>
          )}
          <Button small onClick={finalizeAll} disabled={ready.length === 0}>
            Finalisasi {ready.length > 0 ? `(${ready.length})` : ""}
          </Button>
        </Step>
        <Step n={4} title="Setelah kunci dompet diganti: buka kunci" done={!bal.locked && (guardBal ? BigInt(guardBal.available) > 0n : false)}>
          <Button small variant="ghost" onClick={unlock} disabled={!bal.locked || frozen.length > 0}>
            Buka kunci
          </Button>
        </Step>
        <Step n={5} title="Opsional: kirim saldo akun pemulihan kembali ke dompet" done={false}>
          <span className="text-xs text-stone-500">akun pemulihan memegang {fmt(guardBal?.available)} rUSDC</span>
          <Button small variant="ghost" onClick={giveBack} disabled={bal.locked || !guardBal || guardBal.available === "0"}>
            Kirim balik
          </Button>
        </Step>
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
  const [recoveryId, setRecoveryId] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();

  async function protect(id: string) {
    const r = await call(me, UNDO, "set_recovery", { recovery_id: id }, { gasTera: "30" });
    setMsg(r.ok ? { kind: "ok", text: empty ? "Akun pemulihan terpasang (langsung berlaku karena saldo masih kosong)." : "Akun pemulihan dijadwalkan (berlaku setelah jeda).", hash: r.hash } : { kind: "error", text: r.error ?? "gagal", hash: r.hash });
    onDone();
  }

  async function protectWithDemo() {
    setMsg({ kind: "ok", text: "Membuat akun pemulihan demo di browser ini…" });
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
      setMsg(r.ok ? { kind: "ok", text: "100 USDC testnet diambil dan dibungkus jadi 100 rUSDC.", hash: r.hash } : { kind: "error", text: r.error ?? "gagal", hash: r.hash });
    } catch (e) {
      setMsg({ kind: "error", text: String((e as Error).message ?? e).slice(0, 200) });
    }
    onDone();
  }

  return (
    <Card title="Siapkan wallet ini" tone="accent">
      <ol className="space-y-3 text-sm">
        <li>
          <b>1. Pasang akun pemulihan</b> {hasRecovery ? <Pill tone="ok">sudah</Pill> : pendingRecovery ? <Pill>terjadwal</Pill> : null}
          {!hasRecovery && pendingRecovery && (
            <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
              {short(pendingRecovery[0])} berlaku dalam <Countdown ns={pendingRecovery[1]} done="sebentar lagi (muat ulang)" />. Setelah itu kartu “Uji Tombol Panik” muncul.
            </p>
          )}
          {!hasRecovery && !pendingRecovery && existingGuard && (
            <div className="mt-2">
              <Button small onClick={() => protect(existingGuard.id)}>
                Pasang {short(existingGuard.id)} (akun pemulihan demo yang sudah dibuat)
              </Button>
            </div>
          )}
          {!hasRecovery && !pendingRecovery && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                value={recoveryId}
                onChange={(e) => setRecoveryId(e.target.value.trim())}
                placeholder="akun-lainmu.testnet"
                className="mono w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs sm:w-64 dark:border-stone-700 dark:bg-stone-950"
              />
              <Button small onClick={() => protect(recoveryId)} disabled={!recoveryId}>
                Pasang
              </Button>
              {!existingGuard && (
                <Button small variant="ghost" onClick={protectWithDemo}>
                  atau buat akun pemulihan demo
                </Button>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-stone-500">Pasang sebelum mengisi saldo: selagi akun kosong, akun pemulihan langsung berlaku. Setelah ada saldo, penggantian selalu lewat jeda.</p>
        </li>
        <li>
          <b>2. Ambil 100 USDC testnet dan bungkus jadi rUSDC</b>
          <div className="mt-2">
            <Button small onClick={fund}>
              Ambil & bungkus (1 persetujuan wallet)
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
      + Buat akun “{label}”
    </Button>
  );
}

function SendCard({
  me,
  cfg,
  accounts,
  available,
  onDone,
  onAddAccount,
}: {
  me: DemoAccount;
  cfg: Config;
  accounts: DemoAccount[];
  available?: string;
  onDone: () => void;
  onAddAccount: (a: DemoAccount) => void;
}) {
  const others = accounts.filter((a) => a.id !== me.id);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("10");
  const [mode, setMode] = useState<"rusdc" | "usdc">("rusdc");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const fee = BigInt(cfg.storage_fee) > 0n ? BigInt(cfg.storage_fee) : 1n;
  const target = to || others[0]?.id || "";

  async function send() {
    const amt = Number(amount.replace(",", "."));
    if (!target || !(amt > 0)) return setMsg({ kind: "error", text: "isi penerima dan jumlah" });
    const r =
      mode === "rusdc"
        ? await call(me, UNDO, "transfer", { receiver_id: target, amount: USD(amt) }, { deposit: fee, gasTera: "50" })
        : await call(me, UNDO, "send_usdc", { receiver_id: target, amount: USD(amt) }, { deposit: fee, gasTera: "50" });
    setMsg(r.ok ? { kind: "ok", text: `Terkirim — pending selama ${cfg.window_sec} detik`, hash: r.hash } : { kind: "error", text: r.error ?? "gagal", hash: r.hash });
    onDone();
  }

  async function simulateTheft() {
    let thief = accounts.find((a) => a.label === "Pencuri");
    if (!thief) {
      setMsg({ kind: "ok", text: "Membuat akun pencuri…" });
      thief = await createDemoAccount("Pencuri");
      onAddAccount(thief);
    }
    const avail = BigInt(available ?? 0);
    const steal = (avail * 9n) / 10n;
    if (steal <= 0n) return setMsg({ kind: "error", text: "saldo kosong" });
    const r = await call(me, UNDO, "transfer", { receiver_id: thief.id, amount: steal.toString(), memo: "dicuri" }, { deposit: fee, gasTera: "50" });
    setMsg(
      r.ok
        ? { kind: "ok", text: `Pencuri memakai kunci dompet ini dan mengirim ${fmt(steal)} rUSDC ke ${short(thief.id)}. Uangnya masih pending — pindah ke akun pemulihan dan tekan PANIK.`, hash: r.hash }
        : { kind: "error", text: r.error ?? "gagal", hash: r.hash },
    );
    onDone();
  }

  return (
    <Card title="Kirim">
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-full text-sm sm:w-auto">
          <span className="block text-xs text-stone-500">Penerima</span>
          <input
            list="demo-accounts"
            value={to}
            placeholder={others[0]?.id ?? "akun.testnet"}
            onChange={(e) => setTo(e.target.value.trim())}
            className="mono w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs sm:w-72 dark:border-stone-700 dark:bg-stone-950"
          />
          <datalist id="demo-accounts">
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-stone-500">Jumlah</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded-lg border border-stone-300 bg-white px-2 py-1.5 dark:border-stone-700 dark:bg-stone-950" />
        </label>
        <select value={mode} onChange={(e) => setMode(e.target.value as "rusdc" | "usdc")} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-950">
          <option value="rusdc">rUSDC (penerima pakai Undo)</option>
          <option value="usdc">USDC biasa (penerima siapa saja)</option>
        </select>
        <Button onClick={send}>Kirim</Button>
        <Button variant="danger" onClick={simulateTheft} title="Mengirim 90% saldo ke akun 'Pencuri' memakai kunci dompet ini">
          Simulasikan kunci dicuri
        </Button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Biaya storage {fmtNear(cfg.storage_fee)} NEAR per transfer. Uang masuk pending {cfg.window_sec} detik di kontrak demo ini.
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
  const [out, refresh] = usePoll(() => view<Transfer[]>(UNDO, "get_outgoing", { account_id: protectedId, limit: 20 }), [protectedId], 3000);
  const [acct, refreshAcct] = usePoll(() => view<AccountView>(UNDO, "get_account", { account_id: protectedId }), [protectedId], 3000);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string; hash?: string }>();
  const open = out?.filter((t) => (t.status === "Pending" && BigInt(t.unlock_at) > BigInt(Date.now()) * 1_000_000n) || t.status === "Frozen" || t.status === "Disputed");

  async function panic() {
    const r = await call(me, UNDO, "panic", { account_id: protectedId }, { gasTera: "150" });
    const v = r.value as { frozen?: string[]; swept?: string } | undefined;
    setMsg(
      r.ok
        ? { kind: "ok", text: `Panik! ${v?.frozen?.length ?? 0} transfer keluar dibekukan, sisa ${fmt(v?.swept)} rUSDC dibekukan menuju akun ini. Tanpa bantahan dalam ${cfg.contest_window_sec} detik, tekan Finalisasi.`, hash: r.hash }
        : { kind: "error", text: r.error ?? "gagal", hash: r.hash },
    );
    refresh();
    refreshAcct();
  }

  async function unlock() {
    const r = await call(me, UNDO, "unlock", { account_id: protectedId }, { gasTera: "30" });
    setMsg(r.ok ? { kind: "ok", text: "Akun dibuka kembali.", hash: r.hash } : { kind: "error", text: r.error ?? "gagal" });
    refreshAcct();
  }

  return (
    <Card title={`Akun pemulihan untuk ${short(protectedId)}`} tone="danger" right={acct?.locked ? <Pill tone="danger">terkunci</Pill> : null}>
      <p className="mb-3 text-sm text-stone-600 dark:text-stone-300">
        Kalau kunci dompet utama dicuri, tekan Panik: semua transfer keluar yang masih pending dibekukan, akun dikunci, dan sisa saldonya ikut dibekukan menuju akun ini.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={panic}>
          PANIK
        </Button>
        {acct?.locked && (
          <Button variant="ghost" onClick={unlock}>
            Buka kunci (setelah kunci diganti)
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
      <div className="mt-4">
        <TransferList
          title="Transfer keluar dari dompet utama yang masih bisa dibatalkan atau sedang dibekukan"
          items={open}
          me={me}
          cfg={cfg}
          mode="recovery"
          onDone={() => {
            refresh();
            refreshAcct();
          }}
          empty="Tidak ada transfer keluar yang pending."
        />
      </div>
    </Card>
  );
}
