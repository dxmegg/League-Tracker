import { HashRouter, Navigate, Routes, Route, useParams } from "react-router-dom";
import { FullHistoryShell } from "./components/FullHistoryShell";
import MatchHistory from "./pages/MatchHistory";
import FriendDetail from "./pages/FriendDetail";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import HistorySection from "./pages/HistorySection";
import GlobalChampionDetail from "./pages/GlobalChampionDetail";
import ItemDetail from "./pages/ItemDetail";
import Home from "./pages/Home";

function ScopedFriendDetail() {
  return <FriendDetail />;
}

function FriendsDetailRedirect() {
  const { key } = useParams();
  return <Navigate to={`/history/full/friends/${key ?? ""}`} replace />;
}

function GlobalChampionRedirect() {
  const { championId } = useParams();
  return <Navigate to={`/history/full/champions/champion/${championId ?? ""}`} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<FullHistoryShell />}>
          <Route path="/" element={<MatchHistory />} />
          <Route path="/history/full/:section" element={<HistorySection />} />
          <Route path="/history/:scope/:section" element={<HistorySection />} />
          <Route
            path="/history/:scope/:section/champion/:championId"
            element={<GlobalChampionDetail />}
          />
          <Route path="/history/:scope/items/:itemId" element={<ItemDetail />} />
          <Route path="/history/:scope/:section/:key" element={<ScopedFriendDetail />} />
          <Route path="/history/mayhem" element={<MatchHistory scope="mayhem" />} />
          <Route path="/history/rest" element={<MatchHistory scope="rest" />} />
          <Route path="/history/ranked" element={<MatchHistory scope="ranked" />} />
          <Route path="/history/normal" element={<MatchHistory scope="normal" />} />
          <Route path="/history/aram" element={<MatchHistory scope="aram" />} />
          <Route path="/history/arena" element={<MatchHistory scope="arena" />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/home" element={<Home />} />
          <Route path="/local" element={<Profile />} />
          <Route path="/champions" element={<Navigate to="/history/full/champions" replace />} />
          <Route path="/augments" element={<Navigate to="/history/full/augments" replace />} />
          <Route path="/trends" element={<Navigate to="/history/full/trends" replace />} />
          <Route path="/records" element={<Navigate to="/history/full/records" replace />} />
          <Route path="/global" element={<Navigate to="/history/full/total-stats" replace />} />
          <Route path="/friends" element={<Navigate to="/history/full/friends" replace />} />
          <Route path="/friends/:key" element={<FriendsDetailRedirect />} />
          <Route path="/global/champion/:championId" element={<GlobalChampionRedirect />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
