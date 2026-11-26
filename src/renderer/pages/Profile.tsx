import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProfileData, ProfileRankedEntry } from "../lib/types";
import type {
  AccountListItem,
  AccountSnapshot,
  CurrentSummoner,
  HomeTimePeriod,
  RankEntry,
} from "../../shared/api";
import { ProfileHeader, ProfileView } from "../components/ProfileView";
import { useActiveAccount } from "../hooks/useActiveAccount";
import {
  getAccountsWithData,
  getChampionDataVersion,
  useChampionData,
} from "../hooks/useChampions";
import { useViewState } from "../hooks/useViewState";
import { ALL_ACCOUNTS_SENTINEL } from "../lib/accountsEvent";
import { dbg } from "../../shared/debug";

function toProfileRankedEntry(entry: RankEntry | null): ProfileRankedEntry | null {
  return entry
    ? {
        tier: entry.tier,
        rank: entry.division,
        leaguePoints: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
      }
    : null;
}

function profileDataFromSnapshot(
  snapshot: AccountSnapshot,
  dataDragonVersion: string,
): ProfileData {
  return {
    puuid: snapshot.puuid,
    gameName: snapshot.gameName ?? "Unknown",
    tagLine: snapshot.tagLine ?? "",
    platform: snapshot.platform ?? "",
    profileIconId: snapshot.profileIconId ?? 0,
    summonerLevel: snapshot.summonerLevel ?? 0,
    dataDragonVersion,
    masteryPoints: 0,
    masteryScore: 0,
    totalMasteryPoints: 0,
    totalMasteryScore: 0,
    topMasteryChampions: snapshot.topMasteryChampions.map((champion) => ({
      championId: champion.championId,
      championPoints: champion.points,
      championLevel: champion.level,
    })),
    rankedSolo: toProfileRankedEntry(snapshot.rankedSolo),
    rankedFlex: toProfileRankedEntry(snapshot.rankedFlex),
  };
}

// "Your Profile": one page for both the single-account and combined views
export default function Profile() {
  const log = dbg.scope("profile");
  const championData = useChampionData();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [livePuuid, setLivePuuid] = useState<string | null>(null);
  const [activeAccountRaw] = useActiveAccount();
  const selectedPuuid = useMemo<string | null>(() => {
    if (activeAccountRaw && activeAccountRaw !== ALL_ACCOUNTS_SENTINEL) {
      return activeAccountRaw;
    }
    return livePuuid ?? accounts[0]?.puuid ?? null;
  }, [activeAccountRaw, livePuuid, accounts]);
  const isAllAccounts = activeAccountRaw === ALL_ACCOUNTS_SENTINEL;
  const [syncing, setSyncing] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const loadRequestIdRef = useRef(0);
  const selectedPuuidRef = useRef(selectedPuuid);
  const profileRef = useRef(profile);
  const [timePeriod, setTimePeriod] = useViewState<HomeTimePeriod>("profile.timePeriod", "full");

  useEffect(() => {
    selectedPuuidRef.current = selectedPuuid;
  }, [selectedPuuid]);
  profileRef.current = profile;

  useEffect(() => {
    let mounted = true;
    const refreshLivePuuid = async (): Promise<string | null> => {
      try {
        const nextLivePuuid = await window.api.getCurrentPuuid();
        if (mounted) setLivePuuid(nextLivePuuid);
        return nextLivePuuid;
      } catch (err: unknown) {
        console.warn("Could not refresh current League client account:", err);
        if (mounted) setLivePuuid(null);
        return null;
      }
    };

    void Promise.allSettled([refreshLivePuuid(), getAccountsWithData()]).then(
      ([_liveResult, accountsResult]) => {
        if (!mounted) return;

        const nextAccounts = accountsResult.status === "fulfilled" ? accountsResult.value : [];
        setAccounts(nextAccounts);
      },
    );
    const livePuuidInterval = window.setInterval(() => {
      void refreshLivePuuid();
    }, 60_000);

    const unsubscribe = window.api.onGamesUpdated(() => {
      void window.api
        .listAccountsWithData()
        .then((nextAccounts) => {
          if (mounted) setAccounts(nextAccounts);
        })
        .catch((err: unknown) => {
          console.warn("Could not refresh local account list:", err);
        });
    });

    return () => {
      mounted = false;
      window.clearInterval(livePuuidInterval);
      unsubscribe();
    };
  }, []);

  const loadLocalProfile = useCallback(
    (puuid: string, options?: { silent?: boolean }) =>
      log.safe("load profile", async () => {
        const requestId = ++loadRequestIdRef.current;
        const silent = options?.silent === true;
        setError(null);
        if (!silent) {
          setProfile(null);
        }
        try {
          let profileData: ProfileData;

          if (livePuuid !== null && puuid === livePuuid) {
            let profileIconId = 0;
            let currentSummoner: CurrentSummoner | null = null;
            try {
              currentSummoner = await window.api.getCurrentSummoner();
              if (requestId !== loadRequestIdRef.current) return;
              profileIconId = currentSummoner.profileIconId;
            } catch (err: unknown) {
              console.warn("Could not read current League client profile:", err);
              try {
                profileIconId = (await window.api.getCurrentSummonerProfileIcon()) ?? 0;
                if (requestId !== loadRequestIdRef.current) return;
              } catch (iconErr: unknown) {
                console.warn("Could not read current League client profile icon:", iconErr);
              }
            }

            const localProfile = await window.api.getProfile();
            if (requestId !== loadRequestIdRef.current) return;
            if (!localProfile.puuid) {
              if (requestId !== loadRequestIdRef.current) return;
              setError("No local account data. Connect to the League client or import history.");
              return;
            }

            const profileExtras = await window.api.getProfileExtras();
            if (requestId !== loadRequestIdRef.current) return;
            const dataDragonVersion = await getChampionDataVersion();
            if (requestId !== loadRequestIdRef.current) return;
            profileData = {
              puuid,
              gameName: currentSummoner?.gameName ?? localProfile.name ?? "Local account",
              tagLine: currentSummoner?.tagLine ?? "",
              platform: currentSummoner?.platform || localProfile.platform || "",
              profileIconId: currentSummoner?.profileIconId || profileIconId,
              summonerLevel: currentSummoner?.summonerLevel ?? 0,
              dataDragonVersion,
              masteryPoints: 0,
              masteryScore: 0,
              totalMasteryPoints: profileExtras.totalMasteryPoints ?? 0,
              totalMasteryScore: profileExtras.totalMasteryScore ?? 0,
              topMasteryChampions: profileExtras.topMasteryChampions.map((champion) => ({
                championId: champion.championId,
                championPoints: champion.points,
                championLevel: champion.level,
              })),
              rankedSolo: toProfileRankedEntry(profileExtras.rankedSolo),
              rankedFlex: toProfileRankedEntry(profileExtras.rankedFlex),
            };
          } else {
            const snapshot = await window.api.getAccountSnapshot(puuid);
            if (requestId !== loadRequestIdRef.current) return;
            if (!snapshot) {
              if (requestId !== loadRequestIdRef.current) return;
              setError(
                "No cached data for this account. Log in with it in League Client to fetch.",
              );
              return;
            }
            const dataDragonVersion = await getChampionDataVersion();
            if (requestId !== loadRequestIdRef.current) return;
            profileData = profileDataFromSnapshot(snapshot, dataDragonVersion);
          }

          if (profileData.puuid !== selectedPuuidRef.current) {
            console.warn("[profile] stale load ignored:", {
              loaded: profileData.puuid,
              current: selectedPuuidRef.current,
            });
            return;
          }
          setProfile(profileData);
          log.log("profile loaded", { puuid, icon: profileData.profileIconId });
        } catch (err: unknown) {
          if (requestId !== loadRequestIdRef.current) return;
          console.error("Failed to load local profile:", err);
          const message = err instanceof Error ? err.message : "Could not load local profile";
          if (silent) {
            setSyncError(message);
          } else {
            setError(message);
          }
        }
      }),
    [livePuuid, log],
  );

  const handleRefresh = useCallback(async () => {
    if (!selectedPuuid) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await window.api.syncAccountHistory(selectedPuuid);
      if (!result.ok) {
        setSyncError(result.error ?? "Sync failed");
      } else {
        await loadLocalProfile(selectedPuuid, { silent: true });
      }
    } finally {
      setSyncing(false);
    }
  }, [selectedPuuid, loadLocalProfile]);

  useEffect(() => {
    setSyncError(null);
    setScannedCount(0);
    setTotalCount(0);
    if (!selectedPuuid) return;
    const sameAccount = profileRef.current?.puuid === selectedPuuid;
    if (!sameAccount) setProfile(null);
    void loadLocalProfile(selectedPuuid, { silent: sameAccount });
  }, [selectedPuuid, loadLocalProfile, livePuuid]);

  useEffect(() => {
    if (syncing) {
      return window.api.onBackfillProgress((progress) => {
        setScannedCount(progress.current);
        setTotalCount(progress.total);
      });
    }

    const resetTimer = window.setTimeout(() => {
      setScannedCount(0);
      setTotalCount(0);
    }, 500);
    return () => window.clearTimeout(resetTimer);
  }, [syncing]);

  const selectedAccount = accounts.find((account) => account.puuid === selectedPuuid);
  const header = (
    <ProfileHeader
      mode={isAllAccounts ? "all" : "single"}
      gameName={selectedAccount?.gameName ?? profile?.gameName ?? "Unknown"}
      tagLine={selectedAccount?.tagLine ?? profile?.tagLine ?? null}
      profileIconId={profile?.profileIconId ?? selectedAccount?.profileIconId ?? null}
      level={profile?.summonerLevel ?? null}
      platform={profile?.platform ?? selectedAccount?.platform ?? null}
      lastSeen={selectedAccount?.lastSeen ?? null}
      rankedSolo={profile?.rankedSolo ?? null}
      rankedFlex={profile?.rankedFlex ?? null}
      accounts={accounts}
      activePuuid={isAllAccounts ? null : selectedPuuid}
      livePuuid={livePuuid}
      onRefresh={handleRefresh}
      refreshing={syncing}
      scannedCount={scannedCount}
      totalCount={totalCount}
      syncError={syncError}
      onDismissError={() => setSyncError(null)}
      timePeriod={timePeriod}
      onTimePeriodChange={setTimePeriod}
    />
  );

  return (
    <ProfileView
      header={header}
      profile={profile}
      accounts={accounts}
      error={error}
      account={isAllAccounts ? "all" : selectedPuuid}
      timePeriod={timePeriod}
      champData={championData}
    />
  );
}
