import { useEffect, useRef, useState } from "react";
import type { AccountListItem } from "../../shared/api";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { getAccountsWithData } from "../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { ArrowDownIcon } from "./icons";

const ICON_URL = (id: number) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;

const accountName = (a: AccountListItem) =>
  a.gameName ? `${a.gameName}${a.tagLine ? `#${a.tagLine}` : ""}` : "Unknown";

function Avatar({ label, iconId, all }: { label: string; iconId?: number | null; all?: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[10px] font-bold ${
        all
          ? "bg-gradient-to-br from-lol-crimson/70 to-lol-crimson/20 text-white"
          : "bg-black/40 text-lol-text-bright"
      }`}
    >
      {all ? (
        "All"
      ) : iconId != null ? (
        <img src={ICON_URL(iconId)} alt="" className="h-full w-full object-cover" />
      ) : (
        label.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

// Active-account picker for the top bar; the list is always mounted so it can animate open and closed.
export function AccountMenu() {
  const [activeAccount, setActiveAccount] = useActiveAccount();
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (next: AccountListItem[]) => {
      if (!cancelled) setAccounts(next);
    };
    getAccountsWithData()
      .then(apply)
      .catch(() => apply([]));
    const unsubscribe = window.api.onGamesUpdated(() => {
      void window.api
        .listAccountsWithData()
        .then(apply)
        .catch(() => apply([]));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isAll = activeAccount === ALL_ACCOUNTS_SENTINEL;
  const current = accounts.find((a) => a.puuid === activeAccount);
  const label = isAll ? "All accounts" : current ? accountName(current) : "Unknown";

  const pick = (puuid: string) => {
    setActiveAccount(puuid);
    setOpen(false);
  };

  const rowClass = (active: boolean) =>
    `relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
      active
        ? "bg-lol-crimson/20 text-lol-text-bright shadow-[inset_2px_0_0_var(--theme-crimson)]"
        : "text-lol-text hover:bg-white/[0.07] hover:text-lol-text-bright"
    }`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex max-w-[240px] items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60 ${
          open
            ? "border-lol-crimson/60 bg-lol-crimson/15 text-lol-text-bright"
            : "border-lol-border/60 bg-lol-card/60 text-lol-text hover:border-lol-crimson/40 hover:text-lol-text-bright"
        }`}
      >
        <Avatar label={label} iconId={current?.profileIconId} all={isAll} />
        <span className="truncate font-semibold">{label}</span>
        <ArrowDownIcon
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div
        role="listbox"
        aria-hidden={!open}
        className={`absolute right-0 top-full z-50 mt-2 w-[270px] origin-top-right transition-all duration-200 ease-out ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
      >
        <div className="max-h-[380px] overflow-y-auto rounded-xl border border-lol-crimson/30 bg-lol-card bg-[linear-gradient(160deg,var(--theme-card-hover),var(--theme-card))] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9),0_0_24px_-8px_var(--theme-crimson-glow)]">
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-lol-text/60">
            Saved accounts
          </div>
          <button
            type="button"
            role="option"
            aria-selected={isAll}
            tabIndex={open ? 0 : -1}
            onClick={() => pick(ALL_ACCOUNTS_SENTINEL)}
            className={rowClass(isAll)}
          >
            <Avatar label="All" all />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-tight">All accounts</span>
              <span className="block text-[11px] leading-tight text-lol-text/60">
                {accounts.length} accounts
              </span>
            </span>
          </button>
          {accounts.map((account) => {
            const active = account.puuid === activeAccount;
            return (
              <button
                key={account.puuid}
                type="button"
                role="option"
                aria-selected={active}
                tabIndex={open ? 0 : -1}
                onClick={() => pick(account.puuid)}
                className={rowClass(active)}
              >
                <Avatar label={accountName(account)} iconId={account.profileIconId} />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-tight">
                  {accountName(account)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
