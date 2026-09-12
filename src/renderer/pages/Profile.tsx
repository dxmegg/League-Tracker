import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import { MasteryCrestIcon, MasteryPointsIcon } from "../components/ProfileIcons";
import { shortRegion, PLATFORM_TO_NAME } from "../../shared/regions";
import { QUEUE_LABELS } from "../../shared/queues";

const EMBLEM_BASE_URL = "https://opgg-static.akamaized.net/images/medals_new";
const LAST_LOOKUP_KEY = "profile:lastLookup";
const RECENTS_KEY = "profile:recents";

type ProfileLookup = {
  gameName: string;
  tagLine: string;
  platform: string;
};

function isProfileLookup(value: unknown): value is ProfileLookup {
  if (typeof value !== "object" || value === null) return false;
  const lookup = value as Partial<ProfileLookup>;
  return (
    typeof lookup.gameName === "string" &&
    lookup.gameName.length > 0 &&
    typeof lookup.tagLine === "string" &&
    lookup.tagLine.length > 0 &&
    typeof lookup.platform === "string" &&
    lookup.platform.length > 0
  );
}

function readRecentProfiles(): ProfileLookup[] {
  try {
    const stored = window.localStorage.getItem(RECENTS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isProfileLookup).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function readLastLookup(): ProfileLookup | null {
  try {
    const stored = window.localStorage.getItem(LAST_LOOKUP_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isProfileLookup(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function winRate(entry: ProfileRankedEntry): number {
  const games = entry.wins + entry.losses;
  return games > 0 ? Math.round((entry.wins / games) * 100) : 0;
}

function RankCard({ title, entry }: { title: string; entry: ProfileRankedEntry | null }) {
  return (
    <div className="relative rounded-xl border border-lol-border/70 bg-lol-card/60 p-5 pl-6 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#5865a8]" />
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-lol-text-bright">{title}</h2>
        <button
          type="button"
          aria-label={`${title} options`}
          className="text-lol-text hover:text-lol-text-bright transition-colors"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ⌄
          </span>
        </button>
      </div>
      {entry ? (
        <div className="grid grid-cols-[64px_1fr_auto] items-center gap-4">
          <img
            src={`${EMBLEM_BASE_URL}/${entry.tier.toLowerCase()}.png`}
            alt={`${entry.tier} ranked emblem`}
            className="h-16 w-16 object-contain"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
          <div>
            <p className="text-sm font-semibold text-lol-text-bright">
              {entry.tier} {entry.rank}
            </p>
            <p className="text-xs text-lol-gold mt-1">{entry.leaguePoints} LP</p>
          </div>
          <div className="text-right text-xs text-lol-text">
            <p className="text-lol-text-bright">
              {entry.wins}W {entry.losses}L
            </p>
            <p className="mt-1">{winRate(entry)}% Win Rate</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-lol-text">Unranked</p>
      )}
    </div>
  );
}

type MostPlayedQueue = { queue_id: number; games: number; wins: number };

function MostPlayedMode({ mostPlayed }: { mostPlayed: MostPlayedQueue | null }) {
  if (!mostPlayed || mostPlayed.games <= 0) {
    return (
      <div className="mt-4 w-64 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
          Most played mode
        </p>
        <p className="mt-2 text-sm text-lol-text">No games recorded</p>
      </div>
    );
  }

  const losses = mostPlayed.games - mostPlayed.wins;
  const oneDec = Math.round((mostPlayed.wins / mostPlayed.games) * 1000) / 10;
  const percentColor =
    oneDec >= 54.5
      ? "text-emerald-400"
      : oneDec >= 47.5
        ? "text-yellow-400"
        : oneDec >= 37.5
          ? "text-orange-400"
          : "text-red-400";

  return (
    <div className="mt-4 w-64 rounded-xl border border-lol-border/70 bg-lol-card/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-lol-text/70">
        Most played mode
      </p>
      <p className="mt-1 text-sm font-semibold text-lol-text-bright">
        {QUEUE_LABELS[mostPlayed.queue_id] ?? `Queue ${mostPlayed.queue_id}`}
      </p>
      <div className="mt-1 flex gap-3 text-xs">
        <span className="text-emerald-400">{mostPlayed.wins}W</span>
        <span className="text-red-400">{losses}L</span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-red-400/30">
        <div
          className="h-full bg-emerald-400"
          style={{ width: `${(mostPlayed.wins / mostPlayed.games) * 100}%` }}
        />
        <div
          className="h-full bg-red-400/60"
          style={{ width: `${(losses / mostPlayed.games) * 100}%` }}
        />
      </div>
      <p className={`mt-2 text-center text-xs font-semibold ${percentColor}`}>
        {oneDec.toFixed(1)}% WR
      </p>
    </div>
  );
}

function ProfileForm({
  value,
  platform,
  loading,
  onValueChange,
  onPlatformChange,
  onSubmit,
}: {
  value: string;
  platform: string;
  loading: boolean;
  onValueChange: (value: string) => void;
  onPlatformChange: (platform: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-lol-text">
        Riot ID
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="GameName#TagLine"
          className="h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text-bright outline-none placeholder:text-lol-text/60 focus:border-lol-gold"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-lol-text">
        Server
        <select
          value={platform}
          onChange={(event) => onPlatformChange(event.target.value)}
          className="h-9 rounded-lg border border-lol-gold/40 bg-lol-card px-3 text-sm text-lol-text outline-none focus:border-lol-gold"
        >
          {Object.entries(PLATFORM_TO_NAME).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={!value.trim() || loading}
        className="h-9 rounded-lg border border-lol-gold/60 bg-lol-gold/15 px-4 text-sm text-lol-gold transition-colors hover:bg-lol-gold/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Loading…" : "Load Profile"}
      </button>
    </form>
  );
}

export default function Profile() {
  const [gameNameInput, setGameNameInput] = useState("");
  const [platform, setPlatform] = useState("euw1");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [mostPlayed, setMostPlayed] = useState<MostPlayedQueue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [recentProfiles, setRecentProfiles] = useState<ProfileLookup[]>([]);
  const hasAutoLoaded = useRef(false);

  const fetchProfile = useCallback(async (gameName: string, tagLine: string, selectedPlatform: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    setProfile(null);
    setMostPlayed(null);
    try {
      const result = await window.api.getProfileData(gameName, tagLine, selectedPlatform);
      if (result && "error" in result) {
        setError(result.error);
      } else if (!result) {
        setNotFound(true);
      } else {
        setProfile(result);
        try {
          const queue = await window.api.getMostPlayedQueue(
            result.puuid,
            result.gameName,
            result.tagLine,
          );
          setMostPlayed(queue);
        } catch (err: unknown) {
          console.error("Failed to load local queue breakdown:", err);
        }
        const successfulLookup: ProfileLookup = {
          gameName: result.gameName || gameName,
          tagLine: result.tagLine || tagLine,
          platform: selectedPlatform,
        };
        const normalizedLookup = [
          successfulLookup.gameName.toLowerCase(),
          successfulLookup.tagLine.toLowerCase(),
          successfulLookup.platform.toLowerCase(),
        ];
        const updatedRecents = [
          successfulLookup,
          ...readRecentProfiles().filter((recent) =>
            [recent.gameName, recent.tagLine, recent.platform]
              .map((value) => value.toLowerCase())
              .some((value, index) => value !== normalizedLookup[index]),
          ),
        ].slice(0, 5);
        try {
          window.localStorage.setItem(LAST_LOOKUP_KEY, JSON.stringify(successfulLookup));
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
        try {
          window.localStorage.setItem(RECENTS_KEY, JSON.stringify(updatedRecents));
          setRecentProfiles(updatedRecents);
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
      }
    } catch (err: unknown) {
      console.error("Failed to load profile:", err);
      setError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const separator = gameNameInput.indexOf("#");
    if (separator < 0) {
      if (!gameNameInput.trim()) {
        try {
          window.localStorage.removeItem(LAST_LOOKUP_KEY);
        } catch {
          // Storage may be unavailable in some Electron contexts.
        }
      }
      setError("Enter your Riot ID as GameName#TagLine");
      setNotFound(false);
      return;
    }
    const gameName = gameNameInput.slice(0, separator).trim();
    const tagLine = gameNameInput.slice(separator + 1).trim();
    if (!gameName || !tagLine) {
      setError("Enter your Riot ID as GameName#TagLine");
      setNotFound(false);
      return;
    }

    await fetchProfile(gameName, tagLine, platform);
  };

  useEffect(() => {
    setRecentProfiles(readRecentProfiles());
  }, []);

  useEffect(() => {
    if (hasAutoLoaded.current) return;
    hasAutoLoaded.current = true;

    const lookup = readLastLookup();
    if (!lookup) return;
    setGameNameInput(`${lookup.gameName}#${lookup.tagLine}`);
    setPlatform(lookup.platform);
    void fetchProfile(lookup.gameName, lookup.tagLine, lookup.platform);
  }, [fetchProfile]);

  const loadRecentProfile = useCallback(
    (lookup: ProfileLookup) => {
      setGameNameInput(`${lookup.gameName}#${lookup.tagLine}`);
      setPlatform(lookup.platform);
      void fetchProfile(lookup.gameName, lookup.tagLine, lookup.platform);
    },
    [fetchProfile],
  );

  const form = (
    <ProfileForm
      value={gameNameInput}
      platform={platform}
      loading={loading}
      onValueChange={setGameNameInput}
      onPlatformChange={setPlatform}
      onSubmit={loadProfile}
    />
  );
  const recentStrip = recentProfiles.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {recentProfiles.map((recent) => (
        <button
          key={`${recent.gameName}#${recent.tagLine}:${recent.platform}`}
          type="button"
          disabled={loading}
          onClick={() => loadRecentProfile(recent)}
          className="rounded-full border border-lol-border px-3 py-1 text-xs text-lol-text transition-colors hover:border-lol-gold/60 hover:text-lol-text-bright disabled:cursor-not-allowed disabled:opacity-50"
        >
          {recent.gameName}#{recent.tagLine}
        </button>
      ))}
    </div>
  );

  if (loading || error || notFound || !profile) {
    return (
      <div className="max-w-6xl space-y-4">
        {recentStrip}
        {form}
        {loading && <p className="text-sm text-lol-text">Loading…</p>}
        {error && (
          <p className="rounded-lg border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {notFound && (
          <p className="rounded-lg border border-red-500/60 bg-red-500/10 p-3 text-sm text-red-300">
            Account not found. Check the spelling and server.
          </p>
        )}
      </div>
    );
  }

  const version = profile.dataDragonVersion === "none" ? "latest" : profile.dataDragonVersion;
  const profileIconUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profile.profileIconId}.png`;

  return (
    <div className="max-w-6xl space-y-8">
      {recentStrip}
      {form}
      <div className="grid grid-cols-[220px_minmax(0,1fr)_256px_auto] items-start gap-8">
        <div>
          <div className="h-[220px] w-[220px] rounded-xl bg-[linear-gradient(138deg,#c89b37_0%,#ffe09b_50%,#c89b37_100%)] p-[5px]">
            <img
              src={profileIconUrl}
              alt={`${profile.gameName} profile icon`}
              className="h-full w-full rounded-lg object-cover"
            />
          </div>
          <p className="mt-3 text-sm text-lol-text">Level {profile.summonerLevel}</p>
        </div>

        <div className="min-w-0 pt-0">
          <div>
            <h1
              className="max-w-full break-words text-4xl font-semibold tracking-tight text-lol-text-bright"
              title={`${profile.gameName}#${profile.tagLine}`}
            >
              {profile.gameName}#{profile.tagLine}
            </h1>
            <p className="mt-2 text-sm text-lol-text">
              Region: {shortRegion(profile.platform)}
            </p>
          </div>
          <MostPlayedMode mostPlayed={mostPlayed} />
        </div>
        <div className="w-64 rounded-xl border border-lol-border/70 bg-lol-card/50 px-5 py-4 mt-8">
          <h2 className="text-center text-sm font-semibold text-lol-text-bright">
            Champion Mastery
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-sm text-lol-text">
              <MasteryCrestIcon />
              <span>Points</span>
              <strong className="ml-auto text-lol-text-bright">
                {profile.masteryPoints.toLocaleString("en-US")} pts
              </strong>
            </div>
            <div className="flex items-center gap-3 text-sm text-lol-text">
              <MasteryPointsIcon />
              <span>Score</span>
              <strong className="ml-auto text-lol-text-bright">{profile.masteryScore}</strong>
            </div>
          </div>
          <p className="mt-3 text-center text-[10px] text-lol-text/60">
            Last updated from Riot API
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-8">
          <div className="h-10 w-28 rounded-[20px] border-[3.2px] border-[#94a0b8]" />
          <div className="h-10 w-28 rounded-[20px] border-[3.2px] border-[#94a0b8]" />
          <div className="h-10 w-28 rounded-[20px] border-[3.2px] border-[#94a0b8]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <RankCard title="Ranked Solo" entry={profile.rankedSolo} />
        <RankCard title="Ranked Flex" entry={profile.rankedFlex} />
      </div>
    </div>
  );
}
