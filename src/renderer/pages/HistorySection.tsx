import Champions from "./Champions";
import Augments from "./Augments";
import Friends from "./Friends";
import Trends from "./Trends";
import Records from "./Records";
import GlobalStats from "./GlobalStats";
import Items from "./Items";
import Runes from "./Runes";
import WorkInProgress from "./WorkInProgress";
import { useParams } from "react-router-dom";
import { queueForHistoryScope } from "../lib/historyScope";
import { SectionChrome } from "../components/SectionChrome";

export default function HistorySection() {
  const { scope, section } = useParams<{ scope?: string; section?: string }>();
  const displayScope = scope?.toUpperCase();

  if (section === "champions") {
    return (
      <SectionChrome title="CHAMPIONS" scope={displayScope}>
        <Champions />
      </SectionChrome>
    );
  }
  if (section === "augments") {
    return (
      <SectionChrome title="AUGMENTS" scope={displayScope}>
        <Augments />
      </SectionChrome>
    );
  }
  if (section === "friends") {
    return (
      <SectionChrome title="FRIENDS & FOES" scope={displayScope}>
        <Friends relation="friends" historyScope={scope} historySection={section} />
      </SectionChrome>
    );
  }
  if (section === "enemies") {
    return (
      <SectionChrome title="FRIENDS & FOES" scope={displayScope}>
        <Friends relation="enemies" historyScope={scope} historySection={section} />
      </SectionChrome>
    );
  }
  if (section === "trends") {
    return (
      <SectionChrome title="TRENDS" scope={displayScope}>
        <Trends />
      </SectionChrome>
    );
  }
  if (section === "records") {
    return (
      <SectionChrome title="RECORDS" scope={displayScope}>
        <Records />
      </SectionChrome>
    );
  }
  if (section === "total-stats") {
    return (
      <SectionChrome title="MISC. DATA" scope={displayScope}>
        <GlobalStats />
      </SectionChrome>
    );
  }
  if (section === "items") {
    return (
      <SectionChrome title="ITEMS" scope={displayScope}>
        <Items />
      </SectionChrome>
    );
  }
  if (section === "runes") {
    return (
      <SectionChrome title="RUNES" scope={displayScope}>
        <Runes queue={queueForHistoryScope(scope)} />
      </SectionChrome>
    );
  }
  return <WorkInProgress />;
}
