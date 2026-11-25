import { Children, type ReactNode } from "react";
import type { ChampionStats } from "../../shared/api";
import { useActiveAccount } from "../hooks/useActiveAccount";
import { useChampionData } from "../hooks/useChampions";
import { useIpc } from "../hooks/useIpc";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { CHAMPION_SPLASH_URL } from "../lib/constants";
import { Title } from "./live/shared";

// Splash-art banner in the Home page style, with room for stat tiles
export function SplashHero({
  championId,
  children,
}: {
  championId: number | null | undefined;
  children: ReactNode;
}) {
  const champData = useChampionData();
  const key = championId != null ? champData[championId]?.key : undefined;
  return (
    <section className="relative shrink-0 overflow-hidden rounded-[22px] border border-lol-border/70 shadow-[0_24px_60px_-28px_var(--theme-crimson-glow)]">
      {key && (
        <img
          key={key}
          src={CHAMPION_SPLASH_URL(key)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[50%_22%] opacity-75"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--theme-bg-deep)_4%,rgba(0,0,0,0.1)_48%,rgba(0,0,0,0.45)_100%),linear-gradient(to_top,var(--theme-bg-base),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(720px_380px_at_92%_-12%,var(--theme-crimson-glow),transparent_70%)]" />
      <div className="relative grid grid-cols-1 items-center gap-6 p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        {children}
      </div>
    </section>
  );
}

// Page banner: title on the left, headline numbers on the right, art of the most played champion
export function PageHero({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  const [accountRaw] = useActiveAccount();
  const account = accountRaw === ALL_ACCOUNTS_SENTINEL ? "all" : accountRaw;
  const { data } = useIpc<ChampionStats[]>(
    () => window.api.getChampionStats(undefined, undefined, account, "full"),
    [account],
  );
  const top = data?.reduce<ChampionStats | null>(
    (best, c) => (!best || c.games > best.games ? c : best),
    null,
  );
  return (
    <SplashHero championId={top?.champion_id}>
      <div>
        <h1 className="font-display text-[34px] font-bold leading-none text-lol-text-bright">
          {title}
        </h1>
        <p className="mt-2 text-[13px] text-lol-text">{subtitle}</p>
      </div>
      {children && (
        <div
          className={`grid grid-cols-2 gap-3 ${Children.count(children) % 3 === 0 ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
        >
          {children}
        </div>
      )}
    </SplashHero>
  );
}

export function HeroTile({
  label,
  value,
  sub,
  valueClass = "text-lol-text-bright",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-lol-border/60 bg-black/45 px-4 py-3 backdrop-blur">
      <div className="font-display text-[11px] font-bold uppercase tracking-widest text-lol-gold">
        {label}
      </div>
      <div
        className={`mt-1 truncate font-display text-[28px] font-bold leading-none tabular-nums ${valueClass}`}
        title={value}
      >
        {value}
      </div>
      <div className="mt-1.5 min-h-4 text-[11px] text-lol-text">{sub}</div>
    </div>
  );
}

// "Most played / best win rate" card: icon, name and one big number
export function HighlightTile({
  title,
  icon,
  name,
  value,
  caption,
  hint,
}: {
  title: string;
  icon: ReactNode;
  name: string;
  value: string;
  caption: string;
  hint?: string;
}) {
  return (
    <div className="app-tile min-w-0" title={hint}>
      <Title>{title}</Title>
      <div className="flex items-center gap-4">
        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-lol-border-hover bg-black/30">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[17px] font-bold text-lol-text-bright">
            {name}
          </div>
          <div className="text-[11.5px] text-lol-text">{caption}</div>
        </div>
        <div className="shrink-0 font-display text-[22px] font-bold tabular-nums text-lol-text-bright">
          {value}
        </div>
      </div>
    </div>
  );
}
