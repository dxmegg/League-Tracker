import { HashRouter, Routes, Route } from "react-router-dom";
import { FullHistoryShell } from "./components/FullHistoryShell";
import { SectionChrome } from "./components/SectionChrome";
import MatchHistory from "./pages/MatchHistory";
import FriendDetail from "./pages/FriendDetail";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import HistorySection from "./pages/HistorySection";
import GlobalChampionDetail from "./pages/GlobalChampionDetail";
import ItemDetail from "./pages/ItemDetail";
import Home from "./pages/Home";
import Champions from "./pages/Champions";
import Augments from "./pages/Augments";
import Items from "./pages/Items";
import Runes from "./pages/Runes";
import Friends from "./pages/Friends";
import Trends from "./pages/Trends";
import Records from "./pages/Records";
import GlobalStats from "./pages/GlobalStats";

function ScopedFriendDetail() {
  return <FriendDetail />;
}

function FullHistorySection({ section }: { section: string }) {
  if (section === "champions") {
    return (
      <SectionChrome title="CHAMPIONS" scope="FULL">
        <Champions />
      </SectionChrome>
    );
  }
  if (section === "augments") {
    return (
      <SectionChrome title="AUGMENTS" scope="FULL">
        <Augments />
      </SectionChrome>
    );
  }
  if (section === "items") {
    return (
      <SectionChrome title="ITEMS" scope="FULL">
        <Items />
      </SectionChrome>
    );
  }
  if (section === "runes") {
    return (
      <SectionChrome title="RUNES" scope="FULL">
        <Runes />
      </SectionChrome>
    );
  }
  if (section === "friends") {
    return (
      <SectionChrome title="FRIENDS & FOES" scope="FULL">
        <Friends relation="friends" historyScope="full" historySection={section} />
      </SectionChrome>
    );
  }
  if (section === "trends") {
    return (
      <SectionChrome title="TRENDS" scope="FULL">
        <Trends />
      </SectionChrome>
    );
  }
  if (section === "records") {
    return (
      <SectionChrome title="RECORDS" scope="FULL">
        <Records />
      </SectionChrome>
    );
  }
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
          <Route path="/champions" element={<FullHistorySection section="champions" />} />
          <Route path="/champions/:championId" element={<GlobalChampionDetail />} />
          <Route path="/items" element={<FullHistorySection section="items" />} />
          <Route path="/items/:itemId" element={<ItemDetail />} />
          <Route path="/augments" element={<FullHistorySection section="augments" />} />
          <Route path="/runes" element={<FullHistorySection section="runes" />} />
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
