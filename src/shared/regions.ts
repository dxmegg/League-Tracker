export const PLATFORM_TO_NAME: Record<string, string> = {
  na1: "North America (NA)",
  euw1: "Europe West (EUW)",
  eun1: "Europe Nordic & East (EUNE)",
  me1: "Middle East (ME)",
  kr: "Republic of Korea (KR)",
  jp1: "Japan (JP)",
  oc1: "Oceania (OCE)",
  br1: "Brazil (BR)",
  la1: "Latin America North (LAN)",
  la2: "Latin America South (LAS)",
  tr1: "Turkey (TR)",
  ru: "Russia (RU)",
  ph2: "Philippines (PH)",
  sg2: "Singapore, Malaysia & Indonesia (SG)",
  th2: "Thailand (TH)",
  tw2: "Taiwan, Hong Kong & Macao (TW)",
  vn2: "Vietnam (VN)",
  pbe1: "Public Beta Environment (PBE)",
};

export const PLATFORM_TO_SHORT: Record<string, string> = {
  na1: "NA",
  euw1: "EUW",
  eun1: "EUNE",
  me1: "ME",
  kr: "KR",
  jp1: "JP",
  oc1: "OCE",
  br1: "BR",
  la1: "LAN",
  la2: "LAS",
  tr1: "TR",
  ru: "RU",
  ph2: "PH",
  sg2: "SG",
  th2: "TH",
  tw2: "TW",
  vn2: "VN",
  pbe1: "PBE",
};

export function shortRegion(platform: string): string {
  return PLATFORM_TO_SHORT[platform.toLowerCase()] ?? platform.toUpperCase();
}
