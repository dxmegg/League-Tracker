import { lazy, type ReactNode } from "react";
import { HashRouter, Navigate, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { useActiveMode } from "./hooks/useActiveMode";
import { useDevMode } from "./hooks/useDevMode";

// Pages load on first visit, so launch only parses the shell and the page being opened. Some of
// these files are several thousand lines.
const Settings = lazy(() => import("./pages/Settings"));
const Home = lazy(() => import("./pages/Home"));
const Profile = lazy(() => import("./pages/Profile"));
const FriendDetail = lazy(() => import("./pages/FriendDetail"));
const ChampionDetail = lazy(() => import("./pages/ChampionDetail"));
const ItemDetail = lazy(() => import("./pages/ItemDetail"));
const AugmentDetail = lazy(() => import("./pages/AugmentDetail"));
const Champions = lazy(() => import("./pages/Champions"));
const Augments = lazy(() => import("./pages/Augments"));
const Items = lazy(() => import("./pages/Items"));
const Runes = lazy(() => import("./pages/Runes"));
const Friends = lazy(() => import("./pages/Friends"));
const Storage = lazy(() => import("./pages/Storage"));
const MiscData = lazy(() => import("./pages/MiscData"));
const Trends = lazy(() => import("./pages/Trends"));
const SeasonRecap = lazy(() => import("./pages/SeasonRecap"));
const Records = lazy(() => import("./pages/Records"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Challenges = lazy(() => import("./pages/Challenges"));
const MatchDetailPage = lazy(() => import("./pages/MatchDetailPage"));
const Live = lazy(() => import("./pages/Live"));
const MatchHistory = lazy(() => import("./pages/MatchHistory"));
const DebugTesting = lazy(() => import("./pages/DebugTesting"));

// Mayhem has no runes; a stale /runes URL or link falls back to Home in that mode
function HiddenInMayhem({ children }: { children: ReactNode }) {
  const [mode] = useActiveMode();
  return mode === "mayhem" ? <Navigate to="/home" replace /> : children;
}

// Testing pages exist only in developer mode
function DevOnly({ children }: { children: ReactNode }) {
  const [devMode] = useDevMode();
  return devMode ? children : <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/test" element={<Live />} />
          <Route path="/home" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/match-history" element={<MatchHistory />} />
          <Route path="/match/:gameId" element={<MatchDetailPage />} />
          <Route path="/champions" element={<Champions />} />
          <Route path="/champions/:championId" element={<ChampionDetail />} />
          <Route path="/items" element={<Items />} />
          <Route path="/items/:itemId" element={<ItemDetail />} />
          <Route path="/augments" element={<Augments />} />
          <Route path="/augments/:augmentId" element={<AugmentDetail />} />
          <Route
            path="/runes"
            element={
              <HiddenInMayhem>
                <Runes />
              </HiddenInMayhem>
            }
          />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:key" element={<FriendDetail />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/season-recap" element={<SeasonRecap />} />
          <Route path="/records" element={<Records />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/misc" element={<MiscData />} />
          <Route path="/data" element={<Storage />} />
          <Route path="/settings" element={<Settings />} />
          <Route
            path="/debug"
            element={
              <DevOnly>
                <DebugTesting />
              </DevOnly>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}
