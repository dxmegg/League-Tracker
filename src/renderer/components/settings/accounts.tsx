import { useState, useEffect, useCallback } from "react";
import { useActiveAccount } from "../../hooks/useActiveAccount";
import { invalidateAccountsCache } from "../../hooks/useChampions";
import { ALL_ACCOUNTS_SENTINEL } from "../../lib/accountsEvent";
import type { RiotAccountConfig } from "../../../shared/api";
import { AccountCard, Button, RemoveButton, Section, Switch } from "./parts";

const PLATFORM_LABELS: Record<string, string> = {
  euw1: "EUW",
  eun1: "EUNE",
  na1: "NA",
  kr: "KR",
  br1: "BR",
  jp1: "JP",
  tr1: "TR",
  ru: "RU",
  la1: "LAN",
  la2: "LAS",
  oc1: "OCE",
  ph2: "PH",
  sg2: "SG",
  th2: "TH",
  tw2: "TW",
  vn2: "VN",
};

export function useAccountSettings() {
  const [riotAccounts, setRiotAccounts] = useState<RiotAccountConfig[]>([]);
  const [riotAccountStatus, setRiotAccountStatus] = useState<string | null>(null);
  const [savedSummoners, setSavedSummoners] = useState<
    Array<{
      puuid: string;
      game_name: string | null;
      tag_line: string | null;
      profile_icon: number | null;
      updated_at: number;
      games: number;
    }>
  >([]);
  const [confirmDeleteSummoner, setConfirmDeleteSummoner] = useState<string | null>(null);
  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set());
  const [activeAccount, setActiveAccount] = useActiveAccount();
  const [summonerStatus, setSummonerStatus] = useState<string | null>(null);
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    window.api.getSetting("hidden_accounts").then((off) => {
      setHiddenAccounts(new Set(off ? (JSON.parse(off) as string[]) : []));
      setLoaded(true);
    });
  }, []);

  const refreshRiotAccounts = useCallback(() => {
    window.api
      .listRiotAccounts()
      .then(setRiotAccounts)
      .catch((err: unknown) => {
        setRiotAccountStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, []);

  useEffect(refreshRiotAccounts, [refreshRiotAccounts]);

  const refreshSavedSummoners = useCallback(async () => {
    if (typeof window.api.getSavedSummoners !== "function") {
      console.warn(
        "[settings] getSavedSummoners is not available yet — restart the app so the new preload loads",
      );
      setSummonerStatus(
        "Saved accounts is a new feature — restart the application for it to become available.",
      );
      return [];
    }
    const list = await window.api.getSavedSummoners();
    setSavedSummoners(list);
    return list;
  }, []);

  useEffect(() => {
    void refreshSavedSummoners().catch((err: unknown) => {
      console.error("Failed to load saved accounts:", err);
      setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, [refreshSavedSummoners]);

  const handleDeleteSummoner = useCallback(
    async (puuid: string) => {
      console.log("[delete] start", puuid);
      setConfirmDeleteSummoner(null);
      setSummonerStatus(null);
      if (typeof window.api.deleteSummoner !== "function") {
        setSummonerStatus("Delete account is not available yet — restart the application.");
        return;
      }
      try {
        console.log("[delete] calling api", puuid);
        // A backup taken first can run for half a minute
        setSummonerStatus("Working...");
        const result = await window.api.deleteSummoner(puuid);
        console.log("[delete] result", result);
        if ("cancelled" in result) {
          setSummonerStatus(null);
          return;
        }
        setSummonerStatus(
          `Deleted account: ${result.deletedGames} game(s) removed, ${result.deletedTrackedRows} tracked row(s) removed`,
        );
        const list = await refreshSavedSummoners();
        console.log("[delete] list refreshed", list.length);
      } catch (err) {
        console.error("[delete] error", err);
        setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [refreshSavedSummoners],
  );

  const handleMergeDuplicateAccounts = useCallback(async () => {
    setMergingDuplicates(true);
    setSummonerStatus(null);
    try {
      if (typeof window.api.mergeDuplicateAccounts !== "function") {
        throw new Error("Merge duplicate accounts is not available yet — restart the application.");
      }
      const result = await window.api.mergeDuplicateAccounts();
      await refreshSavedSummoners();
      setSummonerStatus(
        result.merged === 0 ? "No duplicates found" : `Merged ${result.merged} accounts`,
      );
    } catch (err) {
      console.error("[settings] merge duplicate accounts failed:", err);
      setSummonerStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMergingDuplicates(false);
    }
  }, [refreshSavedSummoners]);

  const handleRemoveRiotAccount = useCallback(async (id: string) => {
    setRiotAccountStatus(null);
    try {
      const accounts = await window.api.removeRiotAccount(id);
      setRiotAccounts(accounts);
      setRiotAccountStatus("Riot account removed.");
    } catch (err: unknown) {
      setRiotAccountStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleAccountToggle = useCallback(
    async (puuid: string) => {
      const next = new Set(hiddenAccounts);
      if (!next.delete(puuid)) next.add(puuid);
      setHiddenAccounts(next);
      await window.api.setSetting("hidden_accounts", JSON.stringify([...next]));
      invalidateAccountsCache();
      // A hidden account can't stay the one being looked at
      if (next.has(activeAccount)) setActiveAccount(ALL_ACCOUNTS_SENTINEL);
    },
    [hiddenAccounts, activeAccount, setActiveAccount],
  );

  return {
    loaded,
    riotAccounts,
    riotAccountStatus,
    savedSummoners,
    confirmDeleteSummoner,
    setConfirmDeleteSummoner,
    hiddenAccounts,
    summonerStatus,
    mergingDuplicates,
    handleDeleteSummoner,
    handleMergeDuplicateAccounts,
    handleRemoveRiotAccount,
    handleAccountToggle,
  };
}

export function AccountsSections({
  settings,
}: {
  settings: ReturnType<typeof useAccountSettings>;
}) {
  const {
    riotAccounts,
    riotAccountStatus,
    savedSummoners,
    confirmDeleteSummoner,
    setConfirmDeleteSummoner,
    hiddenAccounts,
    summonerStatus,
    mergingDuplicates,
    handleDeleteSummoner,
    handleMergeDuplicateAccounts,
    handleRemoveRiotAccount,
    handleAccountToggle,
  } = settings;

  return (
    <>
      <Section title="Riot Accounts" className="lg:col-span-2">
        <p className="text-[12.5px] text-lol-text">
          Accounts included when Match-V5 sync searches for recent League matches.
        </p>
        {riotAccounts.length === 0 ? (
          <p className="text-[12.5px] text-lol-text">No Riot accounts configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {riotAccounts.map((account) => {
              const name = `${account.gameName}#${account.tagLine}`;
              // The picture and game count come from the saved account of the same Riot ID
              const saved = savedSummoners.find(
                (row) => `${row.game_name}#${row.tag_line}`.toLowerCase() === name.toLowerCase(),
              );
              return (
                <AccountCard
                  key={account.id}
                  icon={saved?.profile_icon ?? null}
                  name={name}
                  detail={
                    <>
                      <span className="rounded border border-lol-border/60 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider">
                        {PLATFORM_LABELS[account.platform] ?? account.platform}
                      </span>
                      {saved ? `${saved.games} games` : "not synced yet"}
                    </>
                  }
                >
                  <RemoveButton
                    label={`Remove ${name}`}
                    onClick={() => void handleRemoveRiotAccount(account.id)}
                  />
                </AccountCard>
              );
            })}
          </div>
        )}
        {riotAccountStatus && <p className="text-xs text-lol-text">{riotAccountStatus}</p>}
      </Section>

      <Section
        title="Saved accounts"
        action={
          <Button
            variant="neutral"
            onClick={() => void handleMergeDuplicateAccounts()}
            disabled={mergingDuplicates}
          >
            {mergingDuplicates ? "Merging..." : "Merge duplicate accounts"}
          </Button>
        }
        className="lg:col-span-2"
      >
        <p className="text-[12.5px] text-lol-text mb-4">
          The switch shows or hides an account's games everywhere; nothing is removed. Deleting one
          removes its summoner row and every game stored for it; games still owned by another saved
          account are kept.
        </p>
        {savedSummoners.length === 0 ? (
          <p className="text-[12.5px] text-lol-text">No saved accounts yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {savedSummoners.map((summoner) => {
              const name =
                summoner.game_name && summoner.tag_line
                  ? `${summoner.game_name}#${summoner.tag_line}`
                  : (summoner.game_name ?? summoner.puuid);
              const confirming = confirmDeleteSummoner === summoner.puuid;
              const shown = !hiddenAccounts.has(summoner.puuid);
              const shownCount = savedSummoners.filter(
                (other) => !hiddenAccounts.has(other.puuid),
              ).length;
              return (
                <AccountCard
                  key={summoner.puuid}
                  icon={summoner.profile_icon}
                  name={name}
                  dimmed={!shown}
                  detail={
                    confirming
                      ? "Delete all its data?"
                      : `${summoner.games} game${summoner.games === 1 ? "" : "s"}${shown ? "" : " · hidden"}`
                  }
                >
                  {confirming ? (
                    <>
                      <Button
                        variant="destructive"
                        className="!h-7 !px-2"
                        onClick={() => void handleDeleteSummoner(summoner.puuid)}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="neutral"
                        className="!h-7 !px-2"
                        onClick={() => setConfirmDeleteSummoner(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Hiding the last one would empty every page */}
                      <Switch
                        label={`Show data from ${name}`}
                        checked={shown}
                        disabled={shown && shownCount === 1}
                        onChange={() => void handleAccountToggle(summoner.puuid)}
                      />
                      <RemoveButton
                        label={`Delete ${name} and its games`}
                        onClick={() => setConfirmDeleteSummoner(summoner.puuid)}
                      />
                    </>
                  )}
                </AccountCard>
              );
            })}
          </div>
        )}
        {summonerStatus && <p className="mt-3 text-[12.5px] text-lol-text">{summonerStatus}</p>}
      </Section>
    </>
  );
}
