export type GeoInfo = { pincode: string; state: string | null; region: string | null; pin3: string };

const PREFIX2: Record<string, string> = {
  "11": "Delhi",
  "12": "Haryana", "13": "Haryana",
  "14": "Punjab", "15": "Punjab", "16": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu & Kashmir", "19": "Jammu & Kashmir",
  "20": "Uttar Pradesh", "21": "Uttar Pradesh", "22": "Uttar Pradesh", "23": "Uttar Pradesh",
  "24": "Uttar Pradesh", "25": "Uttar Pradesh", "26": "Uttar Pradesh", "27": "Uttar Pradesh", "28": "Uttar Pradesh",
  "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan", "33": "Rajasthan", "34": "Rajasthan",
  "36": "Gujarat", "37": "Gujarat", "38": "Gujarat", "39": "Gujarat",
  "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra", "43": "Maharashtra", "44": "Maharashtra",
  "45": "Madhya Pradesh", "46": "Madhya Pradesh", "47": "Madhya Pradesh", "48": "Madhya Pradesh",
  "49": "Chhattisgarh",
  "50": "Telangana",
  "51": "Andhra Pradesh", "52": "Andhra Pradesh", "53": "Andhra Pradesh",
  "56": "Karnataka", "57": "Karnataka", "58": "Karnataka", "59": "Karnataka",
  "60": "Tamil Nadu", "61": "Tamil Nadu", "62": "Tamil Nadu", "63": "Tamil Nadu", "64": "Tamil Nadu",
  "67": "Kerala", "68": "Kerala", "69": "Kerala",
  "70": "West Bengal", "71": "West Bengal", "72": "West Bengal", "73": "West Bengal", "74": "West Bengal",
  "75": "Odisha", "76": "Odisha", "77": "Odisha",
  "78": "Assam", "79": "North East",
  "80": "Bihar", "81": "Jharkhand", "82": "Bihar", "83": "Jharkhand", "84": "Bihar", "85": "Bihar",
};

const PREFIX3: Record<string, string> = {
  "246": "Uttarakhand", "247": "Uttarakhand", "248": "Uttarakhand", "249": "Uttarakhand",
  "244": "Uttarakhand", "262": "Uttarakhand", "263": "Uttarakhand",
  "403": "Goa", "605": "Puducherry",
};

const REGION: Record<string, string> = {
  Delhi: "North", Haryana: "North", Punjab: "North", "Himachal Pradesh": "North", "Jammu & Kashmir": "North",
  "Uttar Pradesh": "North", Uttarakhand: "North", Rajasthan: "North",
  Gujarat: "West", Maharashtra: "West", Goa: "West",
  "Madhya Pradesh": "Central", Chhattisgarh: "Central",
  Telangana: "South", "Andhra Pradesh": "South", Karnataka: "South", "Tamil Nadu": "South", Kerala: "South", Puducherry: "South",
  "West Bengal": "East", Odisha: "East", Bihar: "East", Jharkhand: "East",
  Assam: "North East", "North East": "North East",
};

export function isValidPincode(p: string | null | undefined): boolean {
  return typeof p === "string" && /^[1-9]\d{5}$/.test(p.trim());
}

export function regionForState(state: string | null | undefined): string | null {
  if (!state) return null;
  return REGION[state] ?? null;
}

export function geoFromPincode(pincode: string): GeoInfo {
  const p = pincode.trim();
  const state = PREFIX3[p.slice(0, 3)] ?? PREFIX2[p.slice(0, 2)] ?? null;
  return { pincode: p, state, region: regionForState(state), pin3: p.slice(0, 3) };
}

/** Normalise a free-text state name to canonical form when it is a known state. */
export function canonicalState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  for (const name of Object.keys(REGION)) if (name.toLowerCase() === s) return name;
  const aliases: Record<string, string> = { delhi: "Delhi", "new delhi": "Delhi", tn: "Tamil Nadu", ka: "Karnataka", mh: "Maharashtra", up: "Uttar Pradesh", wb: "West Bengal", gj: "Gujarat", rj: "Rajasthan", hr: "Haryana", tg: "Telangana", ap: "Andhra Pradesh", kl: "Kerala", orissa: "Odisha", jk: "Jammu & Kashmir" };
  if (aliases[s]) return aliases[s];
  return raw.trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
