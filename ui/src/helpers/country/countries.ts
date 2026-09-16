// ISO 3166-1 alpha-2 codes, which is what POST /api/user/country expects and
// what the backend turns into a flag emoji for the leaderboard.
//
// Only the codes are stored here — names come from Intl.DisplayNames so the
// list stays short and localises itself, rather than hardcoding 250 pairs.

const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  );

export interface Country {
  code: string;
  name: string;
  flag: string;
}

/** Mirrors country_flag() in championship.py — regional indicator symbols. */
export const flagOf = (code: string): string => {
  if (!code || code.length !== 2) return "";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
};

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null; // pre-2021 browsers: fall back to showing the raw code
  }
})();

export const COUNTRIES: Country[] = CODES.map((code) => ({
  code,
  name: regionNames?.of(code) ?? code,
  flag: flagOf(code),
})).sort((a, b) => a.name.localeCompare(b.name));
