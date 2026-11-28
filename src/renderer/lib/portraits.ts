const ALT_CHAMPION_ID = 106; // Volibear

export const usesAltPortrait = (championId: number, on: boolean): boolean =>
  on && championId === ALT_CHAMPION_ID;
