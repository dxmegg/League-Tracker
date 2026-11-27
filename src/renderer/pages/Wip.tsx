import { Link } from "react-router-dom";
import { Panel } from "../components/Panel";
import { useActiveMode } from "../hooks/useActiveMode";

// Folders for what is not finished: each one opens the page holding it
const FOLDERS = [
  { to: "/wip/random", name: "Random panels", text: "Panels taken off Live Game and Home" },
  { to: "/debug", name: "Your Profile Redesign", text: "Preview with template data" },
  { to: "/challenges", name: "Challenges", text: "The Challenges page" },
  { to: "/runes", name: "Runes", text: "The Runes page" },
  { to: "/season-recap", name: "Season Recap", text: "Still empty" },
  { to: "/wip/settings", name: "Settings", text: "Riot accounts, sync and repair tools" },
];

export default function Wip() {
  const [mode] = useActiveMode();
  return (
    <div className="flex min-h-full w-full flex-col gap-5">
      <h1 className="font-display text-[28px] font-bold leading-none text-lol-text-bright">
        Work in progress
      </h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {/* Mayhem has no runes */}
        {FOLDERS.filter((folder) => !(mode === "mayhem" && folder.to === "/runes")).map(
          ({ to, name, text }) => (
            <Link
              key={to}
              to={to}
              className="rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
            >
              <Panel variant="tile" className="h-full transition-transform hover:-translate-y-0.5">
                <div className="font-display text-[16px] font-bold text-lol-text-bright">
                  {name}
                </div>
                <div className="mt-1 text-[12px] text-lol-text">{text}</div>
              </Panel>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
