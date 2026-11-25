# Exports every non-remake game of the three scored systems from matches.db for calibration.
#   python scripts/export-score-sample.py <matches.db> <games.json>
import sqlite3, json, collections, sys
db = sqlite3.connect("file:" + sys.argv[1].replace("\\", "/") + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
sets = {
    "aram": (65, 100, 450, 2400, 2450),
    "sr": (400, 420, 430, 440, 490, 700),
    "arena": (1700, 1740, 1750),
}
out = {}
for name, qs in sets.items():
    games = collections.OrderedDict()
    sql = f"""
    SELECT mp.game_id, mp.queue_id, g.game_duration, g.is_remake,
           mp.participant_id, mp.team_id, mp.champion_id, mp.win,
           mp.kills, mp.deaths, mp.assists,
           mp.double_kills, mp.triple_kills, mp.quadra_kills, mp.penta_kills,
           mp.total_damage_dealt, mp.total_damage_taken, mp.gold_earned, mp.total_heal,
           mp.total_minions_killed + mp.neutral_minions_killed AS cs,
           mp.vision_score, mp.time_cc_others,
           mp.total_heal_on_teammates, mp.total_damage_shielded_on_teammates,
           mp.damage_to_objectives, mp.first_blood_kill, mp.objectives_stolen,
           mp.team_position, mp.player_subteam_id, mp.player_subteam_placement
    FROM match_participants mp JOIN games g ON g.game_id = mp.game_id
    WHERE mp.queue_id IN ({",".join(map(str, qs))}) AND g.is_remake = 0
    ORDER BY mp.game_id, mp.participant_id
    """
    for r in db.execute(sql):
        d = dict(r)
        games.setdefault(d["game_id"], []).append({
            "participantId": d["participant_id"], "teamId": d["team_id"], "championId": d["champion_id"],
            "kills": d["kills"], "deaths": d["deaths"], "assists": d["assists"],
            "doubleKills": d["double_kills"], "tripleKills": d["triple_kills"],
            "quadraKills": d["quadra_kills"], "pentaKills": d["penta_kills"],
            "totalDamageDealtToChampions": d["total_damage_dealt"], "totalDamageTaken": d["total_damage_taken"],
            "goldEarned": d["gold_earned"], "totalHeal": d["total_heal"], "win": bool(d["win"]),
            "queueId": d["queue_id"], "gameDuration": d["game_duration"],
            "teamPosition": d["team_position"] or "", "cs": d["cs"], "visionScore": d["vision_score"],
            "timeCcingOthers": d["time_cc_others"], "healOnTeammates": d["total_heal_on_teammates"],
            "shieldedOnTeammates": d["total_damage_shielded_on_teammates"],
            "damageToObjectives": d["damage_to_objectives"], "firstBlood": bool(d["first_blood_kill"]),
            "objectivesStolen": d["objectives_stolen"],
            "subteamId": d["player_subteam_id"], "placement": d["player_subteam_placement"],
        })
    out[name] = list(games.values())
    print(name, len(out[name]), "games")
json.dump(out, open(sys.argv[2], "w"))
