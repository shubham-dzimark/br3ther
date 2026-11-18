/**
 * Countries, their subdivisions and postal-code rules for the checkout.
 *
 * Deliberately data, not an API call: address forms must work instantly and
 * offline-ish, and a third-party lookup would add a failure mode to the one
 * page that must never break.
 *
 * Subdivisions are listed for the countries that genuinely have a fixed,
 * commonly-required set. Everywhere else the region stays a free-text field
 * rather than a dropdown that's wrong for the customer's address.
 */

export type Country = { code: string; name: string };

export const COUNTRIES: Country[] = [
  { code: "CA", name: "Canada" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CH", name: "Switzerland" },
  { code: "CN", name: "China" },
  { code: "CZ", name: "Czechia" },
  { code: "DE", name: "Germany" },
  { code: "DK", name: "Denmark" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "MX", name: "Mexico" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SE", name: "Sweden" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa" },
];

export const SUBDIVISIONS: Record<string, { code: string; name: string }[]> = {
  CA: [
    { code: "AB", name: "Alberta" },
    { code: "BC", name: "British Columbia" },
    { code: "MB", name: "Manitoba" },
    { code: "NB", name: "New Brunswick" },
    { code: "NL", name: "Newfoundland and Labrador" },
    { code: "NS", name: "Nova Scotia" },
    { code: "NT", name: "Northwest Territories" },
    { code: "NU", name: "Nunavut" },
    { code: "ON", name: "Ontario" },
    { code: "PE", name: "Prince Edward Island" },
    { code: "QC", name: "Quebec" },
    { code: "SK", name: "Saskatchewan" },
    { code: "YT", name: "Yukon" },
  ],
  US: [
    ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
    ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","District of Columbia"],
    ["FL","Florida"],["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],
    ["IN","Indiana"],["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],
    ["ME","Maine"],["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],
    ["MS","Mississippi"],["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],
    ["NH","New Hampshire"],["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],
    ["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],
    ["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],["SD","South Dakota"],
    ["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],["VA","Virginia"],
    ["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ].map(([code, name]) => ({ code, name })),
  AU: [
    { code: "ACT", name: "Australian Capital Territory" },
    { code: "NSW", name: "New South Wales" },
    { code: "NT", name: "Northern Territory" },
    { code: "QLD", name: "Queensland" },
    { code: "SA", name: "South Australia" },
    { code: "TAS", name: "Tasmania" },
    { code: "VIC", name: "Victoria" },
    { code: "WA", name: "Western Australia" },
  ],
};

/**
 * Postal formats, as a pattern plus a human example.
 *
 * Only for countries whose format is genuinely fixed. A country missing here
 * accepts anything, which is the right default - rejecting a valid address the
 * pattern didn't anticipate is far worse than accepting a typo.
 */
export const POSTAL_RULES: Record<
  string,
  { pattern: string; example: string; label?: string }
> = {
  CA: {
    pattern: "[ABCEGHJ-NPRSTVXYabceghj-nprstvxy][0-9][ABCEGHJ-NPRSTV-Zabceghj-nprstv-z] ?[0-9][ABCEGHJ-NPRSTV-Zabceghj-nprstv-z][0-9]",
    example: "K1A 0B1",
  },
  US: { pattern: "[0-9]{5}(-[0-9]{4})?", example: "90210", label: "ZIP code" },
  GB: {
    pattern: "[A-Za-z]{1,2}[0-9][A-Za-z0-9]? ?[0-9][A-Za-z]{2}",
    example: "SW1A 1AA",
    label: "Postcode",
  },
  AU: { pattern: "[0-9]{4}", example: "2000" },
  NZ: { pattern: "[0-9]{4}", example: "6011" },
  DE: { pattern: "[0-9]{5}", example: "10115" },
  FR: { pattern: "[0-9]{5}", example: "75001" },
  NL: { pattern: "[0-9]{4} ?[A-Za-z]{2}", example: "1012 AB" },
  IN: { pattern: "[0-9]{6}", example: "110001", label: "PIN code" },
  JP: { pattern: "[0-9]{3}-?[0-9]{4}", example: "100-0001" },
  BR: { pattern: "[0-9]{5}-?[0-9]{3}", example: "01310-100" },
  ES: { pattern: "[0-9]{5}", example: "28001" },
  IT: { pattern: "[0-9]{5}", example: "00100" },
  SE: { pattern: "[0-9]{3} ?[0-9]{2}", example: "111 22" },
  PL: { pattern: "[0-9]{2}-?[0-9]{3}", example: "00-001" },
  PT: { pattern: "[0-9]{4}-?[0-9]{3}", example: "1000-001" },
  SG: { pattern: "[0-9]{6}", example: "018956" },
  ZA: { pattern: "[0-9]{4}", example: "8001" },
};

export function regionLabelFor(country: string): string {
  if (country === "US") return "State";
  if (country === "CA") return "Province";
  if (country === "AU") return "State / territory";
  return "Province / state";
}

export function postalLabelFor(country: string): string {
  return POSTAL_RULES[country]?.label ?? "Postal code";
}
