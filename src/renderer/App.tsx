import { lazy, type ReactNode } from "react";
import { HashRouter, Navigate, Routes, Route, useParams } from "react-router-dom";
import { FullHistoryShell } from "./components/FullHistoryShell";
import { SectionChrome } from "./components/SectionChrome";
import { useActiveMode } from "./hooks/useActiveMode";
import { useActiveTheme } from "./hooks/useActiveTheme";

// Pages load on first visit, so launch only parses the shell and the page being opened. Some of
// these files are several thousand lines.
const MatchHistory = lazy(() => import("./pages/MatchHistory"));
const FriendDetail = lazy(() => import("./pages/FriendDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const HistorySection = lazy(() => import("./pages/HistorySection"));
const GlobalChampionDetail = lazy(() => import("./pages/GlobalChampionDetail"));
const ChampionDetailExp = lazy(() =>
  import("./components/ChampionDetailExp").then((m) => ({ default: m.ChampionDetailExp })),
);
const ChampionDetailRedesign = lazy(() =>
  import("./components/ChampionDetailRedesign").then((m) => ({
    default: m.ChampionDetailRedesign,
  })),
);
const ItemDetailExp = lazy(() =>
  import("./components/ItemDetailExp").then((m) => ({ default: m.ItemDetailExp })),
);
const ItemDetail = lazy(() => import("./pages/ItemDetail"));
const Home = lazy(() => import("./pages/Home"));
const Champions = lazy(() => import("./pages/Champions"));
const Augments = lazy(() => import("./pages/Augments"));
const Items = lazy(() => import("./pages/Items"));
const Runes = lazy(() => import("./pages/Runes"));
const Friends = lazy(() => import("./pages/Friends"));
const Trends = lazy(() => import("./pages/Trends"));
const Records = lazy(() => import("./pages/Records"));
const MatchDetailPage = lazy(() => import("./pages/MatchDetailPage"));
const GlobalStats = lazy(() => import("./pages/GlobalStats"));
const Live = lazy(() => import("./pages/Live"));
const MatchHistoryTab = lazy(() => import("./pages/MatchHistoryTab"));

function ChampionsDetailRoute() {
  const activeTheme = useActiveTheme();
  const exactTheme = useActiveTheme({ exact: true });
  const { championId } = useParams<{ championId: string }>();
  // The cross-champion summary keeps the old page; single champions get the redesigned one
  if (exactTheme === "redesign" && championId !== "summary") return <ChampionDetailRedesign />;
  return activeTheme === "experiment" ? <ChampionDetailExp /> : <GlobalChampionDetail />;
}

function ItemDetailRoute() {
  const activeTheme = useActiveTheme();
  return activeTheme === "experiment" ? <ItemDetailExp /> : <ItemDetail />;
}

// Redesign has no Local Account or History tab; both land on Your Profile
function RedirectInRedesign({ children }: { children: ReactNode }) {
  const isRedesign = useActiveTheme({ exact: true }) === "redesign";
  return isRedesign ? <Navigate to="/profile" replace /> : children;
}

// Mayhem has no runes; a stale /runes URL or link falls back to Home in that mode
function HiddenInMayhem({ children }: { children: ReactNode }) {
  const [mode] = useActiveMode();
  return mode === "mayhem" ? <Navigate to="/home" replace /> : children;
}

function ScopedFriendDetail() {
  return <FriendDetail />;
}

function FullHistorySection({ section }: { section: string }) {
  const activeTheme = useActiveTheme();
  const isExperiment = activeTheme === "experiment";

  if (section === "champions") {
    if (isExperiment) return <Champions />;
    return (
      <SectionChrome title="CHAMPIONS" scope="FULL">
        <Champions />
      </SectionChrome>
    );
  }
  if (section === "augments") {
    if (isExperiment) return <Augments />;
    return (
      <SectionChrome title="AUGMENTS" scope="FULL">
        <Augments />
      </SectionChrome>
    );
  }
  if (section === "items") {
    if (isExperiment) return <Items />;
    return (
      <SectionChrome title="ITEMS" scope="FULL">
        <Items />
      </SectionChrome>
    );
  }
  if (section === "runes") {
    if (isExperiment) return <Runes />;
    return (
      <SectionChrome title="RUNES" scope="FULL">
        <Runes />
      </SectionChrome>
    );
  }
  if (section === "friends") {
    if (isExperiment)
      return <Friends relation="friends" historyScope="full" historySection={section} />;
    return (
      <SectionChrome title="FRIENDS & FOES" scope="FULL">
        <Friends relation="friends" historyScope="full" historySection={section} />
      </SectionChrome>
    );
  }
  if (section === "trends") {
    if (isExperiment) return <Trends />;
    return (
      <SectionChrome title="TRENDS" scope="FULL">
        <Trends />
      </SectionChrome>
    );
  }
  if (section === "records") {
    if (isExperiment) return <Records />;
    return (
      <SectionChrome title="RECORDS" scope="FULL">
        <Records />
      </SectionChrome>
    );
  }
  if (isExperiment) return <GlobalStats />;
  return (
    <SectionChrome title="MISC. DATA" scope="FULL">
      <GlobalStats />
    </SectionChrome>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<FullHistoryShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route
            path="/history"
            element={
              <RedirectInRedesign>
                <MatchHistory />
              </RedirectInRedesign>
            }
          />
          <Route path="/match/:gameId" element={<MatchDetailPage />} />
          <Route path="/history/full/:section" element={<HistorySection />} />
          <Route path="/history/:scope/:section" element={<HistorySection />} />
          <Route
            path="/history/:scope/:section/champion/:championId"
            element={<GlobalChampionDetail />}
          />
          <Route path="/history/:scope/items/:itemId" element={<ItemDetailRoute />} />
          <Route path="/history/:scope/:section/:key" element={<ScopedFriendDetail />} />
          <Route path="/history/mayhem" element={<MatchHistory scope="mayhem" />} />
          <Route path="/history/rest" element={<MatchHistory scope="rest" />} />
          <Route path="/history/ranked" element={<MatchHistory scope="ranked" />} />
          <Route path="/history/normal" element={<MatchHistory scope="normal" />} />
          <Route path="/history/aram" element={<MatchHistory scope="aram" />} />
          <Route path="/history/arena" element={<MatchHistory scope="arena" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/test" element={<Live />} />
          <Route path="/home" element={<Home />} />
          <Route
            path="/local"
            element={
              <RedirectInRedesign>
                <Profile />
              </RedirectInRedesign>
            }
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/match-history" element={<MatchHistoryTab />} />
          <Route path="/champions" element={<FullHistorySection section="champions" />} />
          <Route path="/champions/:championId" element={<ChampionsDetailRoute />} />
          <Route path="/items" element={<FullHistorySection section="items" />} />
          <Route path="/items/:itemId" element={<ItemDetailRoute />} />
          <Route path="/augments" element={<FullHistorySection section="augments" />} />
          <Route
            path="/runes"
            element={
              <HiddenInMayhem>
                <FullHistorySection section="runes" />
              </HiddenInMayhem>
            }
          />
          <Route path="/friends" element={<FullHistorySection section="friends" />} />
          <Route path="/friends/:key" element={<FriendDetail />} />
          <Route path="/trends" element={<FullHistorySection section="trends" />} />
          <Route path="/records" element={<FullHistorySection section="records" />} />
          <Route path="/data" element={<FullHistorySection section="total-stats" />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
