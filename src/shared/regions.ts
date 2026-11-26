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

export function shortRegion(platform: string | null | undefined): string {
  if (!platform) return "—";
  const code = platform.toLowerCase().trim();
  return PLATFORM_TO_SHORT[code] ?? code.replace(/[0-9]+$/, "").toUpperCase();
}
