/// <reference types="vite/client" />
import type { ReactNode } from "react";
import icon from "../../../assets/icon.png";
import { useIpc } from "../hooks/useIpc";
import { Title } from "./live/shared";

const REPO_URL = "https://github.com/dxmegg/League-Tracker";

const LINKS = [
  { label: "Source code", url: REPO_URL },
  { label: "Changelog", url: `${REPO_URL}/blob/main/CHANGELOG.md` },
  { label: "License (MIT)", url: `${REPO_URL}/blob/main/LICENSE` },
];

const SOURCES = [
  { name: "League Client", use: "Detects games and reads your match history" },
  {
    name: "Riot Games API",
    use: "History, timelines and ranks, via a proxy that holds the API key",
  },
  { name: "Data Dragon & CommunityDragon", use: "Champion, item, rune and augment art" },
  { name: "OP.GG", use: "Player lookups" },
  { name: "GitHub", use: "Update checks" },
];
const PAYLOAD_INFO = [
  {
    category: "Match metadata",
    description: "Stored on games for each imported match.",
    fields: [
      "game_id",
      "queue_id",
      "game_mode",
      "game_creation",
      "game_duration",
      "is_remake",
      "puuid",
      "game_version",
      "source",
      "favorite",
      "raw_gz",
    ],
  },
  {
    category: "Player stats",
    description:
      "One normalized row per participant, including items, spells, runes, and objective stats.",
    fields: [
      "game_id",
      "participant_id",
      "puuid",
      "game_name",
      "tag_line",
      "profile_icon",
      "team_id",
      "player_subteam_id",
      "player_subteam_placement",
      "champion_id",
      "win",
      "kills",
      "deaths",
      "assists",
      "double_kills",
      "triple_kills",
      "quadra_kills",
      "penta_kills",
      "total_damage_dealt",
      "total_damage_taken",
      "true_damage",
      "gold_earned",
      "total_heal",
      "largest_killing_spree",
      "largest_critical_strike",
      "cs",
      "early_surrender",
      "total_damage_dealt_all",
      "true_damage_dealt",
      "physical_damage_dealt",
      "magic_damage_dealt",
      "physical_damage_taken",
      "magic_damage_taken",
      "true_damage_taken",
      "damage_self_mitigated",
      "damage_to_objectives",
      "damage_to_turrets",
      "time_cc_others",
      "total_cc_dealt",
      "longest_alive",
      "killing_sprees",
      "first_blood_kill",
      "first_blood_assist",
      "gold_spent",
      "champ_level",
      "total_minions_killed",
      "neutral_minions_killed",
      "neutral_minions_enemy_jungle",
      "neutral_minions_team_jungle",
      "turret_kills",
      "inhibitor_kills",
      "turret_plates_taken",
      "first_tower_kill",
      "first_tower_assist",
      "first_inhibitor_kill",
      "first_inhibitor_assist",
      "baron_kills",
      "objectives_stolen",
      "objectives_stolen_assists",
      "total_units_healed",
      "vision_score",
      "wards_placed",
      "wards_killed",
      "vision_wards_bought",
      "sight_wards_bought",
      "is_remake",
      "queue_id",
      "game_version",
      "spell1",
      "spell2",
      "rune0",
      "rune1",
      "rune2",
      "rune3",
      "rune4",
      "rune5",
      "primary_style",
      "secondary_style",
      "item0",
      "item1",
      "item2",
      "item3",
      "item4",
      "item5",
      "item6",
      "team_position",
      "score",
    ],
  },
  {
    category: "Timeline events",
    description: "Normalized events fetched from the match timeline.",
    fields: [
      "game_id",
      "event_index",
      "timestamp_ms",
      "event_type",
      "participant_id",
      "killer_id",
      "victim_id",
      "team_id",
      "item_id",
      "skill_slot",
      "level_up_type",
      "ward_type",
      "building_type",
      "monster_type",
      "monster_subtype",
      "raw_json",
    ],
  },
  {
    category: "Timeline frames",
    description: "Periodic per-participant snapshots from the match timeline.",
    fields: [
      "game_id",
      "frame_index",
      "timestamp_ms",
      "participant_id",
      "puuid",
      "level",
      "xp",
      "gold",
      "cs",
      "position_x",
      "position_y",
      "attack_damage",
      "ability_power",
      "armor",
      "magic_resist",
      "attack_speed",
      "ability_haste",
      "move_speed",
      "max_health",
      "current_health",
    ],
  },
  {
    category: "Timeline status",
    description: "Fetch state and compressed source payload for each timeline.",
    fields: ["game_id", "fetched_at", "frame_count", "event_count", "fetch_error", "raw_gz"],
  },
  {
    category: "Summoner",
    description: "Saved account identity and latest profile snapshots.",
    fields: [
      "puuid",
      "game_name",
      "tag_line",
      "summoner_id",
      "account_id",
      "profile_icon",
      "updated_at",
      "platform",
      "summoner_level",
      "ranked_solo_json",
      "ranked_flex_json",
      "mastery_json",
      "last_seen",
    ],
  },
  {
    category: "Settings",
    description: "Application preferences stored as string key-value pairs.",
    fields: ["key", "value"],
  },
] satisfies Array<{ category: string; description: string; fields: string[] }>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="app-tile min-w-0">
      <Title>{title}</Title>
      {children}
    </section>
  );
}

export function AboutSection() {
  const { data: version } = useIpc(() => window.api.getVersion(), []);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:col-span-2 lg:grid-cols-2">
      <section className="app-tile flex min-w-0 flex-wrap items-center gap-4 lg:col-span-2">
        <img src={icon} alt="" className="h-16 w-16 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[22px] font-bold leading-tight text-lol-text-bright">
            Rift Records
            {version && (
              <span className="ml-2 text-[12px] font-semibold text-lol-text">v{version}</span>
            )}
          </h2>
          <p className="text-[13px] text-lol-text">
            Local match history and stats tracker for League of Legends, made by dxmegg.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LINKS.map(({ label, url }) => (
            <button
              key={label}
              type="button"
              onClick={() => window.api.openUrl(url)}
              className="h-9 rounded-lg border border-lol-border/60 bg-lol-card/60 px-3.5 text-xs font-bold uppercase tracking-wider text-lol-text-bright transition-colors hover:border-lol-crimson/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <Panel title="Your data">
        <p className="mb-3 text-[12.5px] leading-relaxed text-lol-text">
          Match history is stored in a database on this computer. There is no Rift Records account
          or server. The app goes online only for these services:
        </p>
        <dl className="divide-y divide-lol-border/30">
          {SOURCES.map(({ name, use }) => (
            <div key={name} className="flex justify-between gap-4 py-2 text-[12px]">
              <dt className="font-semibold text-lol-text-bright">{name}</dt>
              <dd className="text-right text-lol-text">{use}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="Legal">
        <div className="space-y-3 text-[12.5px] leading-relaxed text-lol-text">
          <p>
            Rift Records was created under Riot Games&apos; &quot;Legal Jibber Jabber&quot; policy
            using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
          </p>
          <p>
            Rift Records isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or
            opinions of Riot Games or anyone officially involved in producing or managing Riot Games
            properties. Riot Games and all associated properties are trademarks or registered
            trademarks of Riot Games, Inc.
          </p>
          <button
            type="button"
            onClick={() => window.api.openUrl("https://www.riotgames.com/en/legal")}
            className="text-lol-gold hover:underline"
          >
            Riot Games legal policies
          </button>
          <p className="border-t border-lol-border/30 pt-3">
            Released under the MIT License, without warranty of any kind. Icons are based on Lucide
            (ISC). Fonts: Chakra Petch and IBM Plex Sans (SIL Open Font License).
          </p>
        </div>
      </Panel>

      <section className="app-tile min-w-0 lg:col-span-2">
        <Title>Stored data / payload information</Title>
        <p className="mb-3 text-[12.5px] text-lol-text">
          Fields saved per game from the League client and Riot Match-V5. Open a group to see them.
        </p>
        <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2">
          {PAYLOAD_INFO.map((group) => (
            <details
              key={group.category}
              className="group rounded-xl border border-lol-border/50 bg-black/25 transition-colors open:border-lol-crimson/40 hover:border-lol-crimson/40"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lol-crimson/60">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[14px] font-bold text-lol-text-bright">
                    {group.category}
                  </span>
                  <span className="block text-[11px] text-lol-text">{group.description}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-lol-gold">
                  {group.fields.length} fields
                </span>
                <span
                  aria-hidden="true"
                  className="text-lol-text transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <ul className="flex flex-wrap gap-1.5 border-t border-lol-border/30 p-3">
                {group.fields.map((field) => (
                  <li
                    key={field}
                    className="rounded border border-lol-border/50 bg-black/30 px-1.5 py-0.5 font-mono text-[10.5px] text-lol-text-bright"
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
