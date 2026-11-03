"use client";
// Accounts the app can act as: a real wallet connected through NEAR Connect (if any) plus demo
// accounts (testnet, keys in this browser), and which one is active.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAccountLabel, useT } from "@/lib/i18n";
import { loadAccounts, saveAccounts, type DemoAccount } from "@/lib/near-client";
import { getConnector } from "@/lib/wallet";

type Ctx = {
  accounts: DemoAccount[];
  active: DemoAccount | undefined;
  setActive: (id: string) => void;
  add: (a: DemoAccount, makeActive?: boolean) => void;
  reset: () => void;
  ready: boolean;
  wallet: DemoAccount | undefined;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  walletError: string | undefined;
};

const AccountsCtx = createContext<Ctx | null>(null);
const ACTIVE = "undo.demo.active.v1";
const asWallet = (id: string): DemoAccount => ({ id, key: "", label: "Wallet", kind: "wallet" });

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [walletId, setWalletId] = useState<string>();
  const [walletError, setWalletError] = useState<string>();
  const [activeId, setActiveId] = useState<string>();
  const [ready, setReady] = useState(false);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE, id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const list = loadAccounts();
    setDemo(list);
    let id: string | undefined;
    try {
      id = localStorage.getItem(ACTIVE) ?? undefined;
    } catch {
      /* ignore */
    }
    setActiveId(id ?? list[0]?.id);
    setReady(true);

    // Restore a previously connected wallet and follow sign-in / sign-out.
    let alive = true;
    getConnector()
      .then(async (c) => {
        c.on("wallet:signIn", (t) => {
          const acc = t.accounts?.[0]?.accountId;
          if (acc && alive) {
            setWalletId(acc);
            setActive(acc);
          }
        });
        c.on("wallet:signOut", () => alive && setWalletId(undefined));
        try {
          const { accounts } = await c.getConnectedWallet();
          if (alive && accounts?.[0]) setWalletId(accounts[0].accountId);
        } catch {
          /* no wallet connected yet */
        }
      })
      .catch((e) => alive && setWalletError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [setActive]);

  const add = useCallback(
    (a: DemoAccount, makeActive = false) => {
      setDemo((prev) => {
        const next = [...prev.filter((p) => p.id !== a.id), { ...a, kind: "demo" as const }];
        saveAccounts(next);
        return next;
      });
      if (makeActive) setActive(a.id);
    },
    [setActive],
  );

  const reset = useCallback(() => {
    saveAccounts([]);
    setDemo([]);
    setActiveId(walletId);
  }, [walletId]);

  const connectWallet = useCallback(async () => {
    setWalletError(undefined);
    try {
      const c = await getConnector();
      await c.connect();
    } catch (e) {
      setWalletError(String((e as Error)?.message ?? e));
    }
  }, []);

  const disconnectWallet = useCallback(async () => {
    try {
      const c = await getConnector();
      await c.disconnect();
    } finally {
      setWalletId(undefined);
    }
  }, []);

  const wallet = walletId ? asWallet(walletId) : undefined;
  const accounts = wallet ? [wallet, ...demo.filter((d) => d.id !== wallet.id)] : demo;
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  return (
    <AccountsCtx.Provider value={{ accounts, active, setActive, add, reset, ready, wallet, connectWallet, disconnectWallet, walletError }}>
      {children}
    </AccountsCtx.Provider>
  );
}

export function useAccounts() {
  const c = useContext(AccountsCtx);
  if (!c) throw new Error("AccountsProvider missing");
  return c;
}

export function AccountSwitcher() {
  const { accounts, active, setActive, wallet, connectWallet, disconnectWallet } = useAccounts();
  const t = useT();
  const accountLabel = useAccountLabel();
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      {accounts.length > 0 && (
        <select
          className="min-w-0 flex-1 truncate rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm sm:max-w-[16rem] dark:border-stone-700 dark:bg-stone-900"
          value={active?.id}
          onChange={(e) => setActive(e.target.value)}
          aria-label={t("Akun aktif", "Active account")}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.kind === "wallet" ? `Wallet · ${a.id}` : `${accountLabel(a.label)} · ${a.id.split(".")[0]}`}
            </option>
          ))}
        </select>
      )}
      {wallet ? (
        <button onClick={disconnectWallet} className="shrink-0 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800">
          {t("Putuskan wallet", "Disconnect wallet")}
        </button>
      ) : (
        <button onClick={connectWallet} className="shrink-0 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300">
          {t("Hubungkan wallet", "Connect wallet")}
        </button>
      )}
    </div>
  );
}
