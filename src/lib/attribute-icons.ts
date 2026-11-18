/**
 * The shop's built-in icon set for attribute values.
 *
 * Chosen from a picker rather than uploaded: a flavour list is the same twenty
 * fruits in every shop, and asking someone to find, crop and upload a mango
 * picture to label a mango is work for nothing. They are emoji, which means
 * they are already coloured, weigh nothing, need no upload directory and
 * render on a phone, in an email and in a PDF.
 *
 * The id is what is stored, never the glyph, so the drawing can be swapped for
 * an SVG set later without touching a single row.
 */
export type AttributeIcon = {
  id: string;
  label: string;
  glyph: string;
  /** Extra words the picker's search should match. */
  keywords?: string;
};

export type AttributeIconGroup = {
  name: string;
  icons: AttributeIcon[];
};

export const ATTRIBUTE_ICON_GROUPS: AttributeIconGroup[] = [
  {
    name: "Fruit",
    icons: [
      { id: "apple", label: "Apple", glyph: "🍎" },
      { id: "green-apple", label: "Green apple", glyph: "🍏", keywords: "granny sour" },
      { id: "pear", label: "Pear", glyph: "🍐" },
      { id: "orange", label: "Orange", glyph: "🍊", keywords: "tangerine mandarin citrus" },
      { id: "lemon", label: "Lemon", glyph: "🍋", keywords: "citrus sour" },
      { id: "lime", label: "Lime", glyph: "🍋‍🟩", keywords: "citrus" },
      { id: "banana", label: "Banana", glyph: "🍌" },
      { id: "watermelon", label: "Watermelon", glyph: "🍉", keywords: "melon" },
      { id: "grapes", label: "Grapes", glyph: "🍇", keywords: "grape purple" },
      { id: "strawberry", label: "Strawberry", glyph: "🍓", keywords: "berry" },
      { id: "blueberries", label: "Blueberries", glyph: "🫐", keywords: "berry blue" },
      { id: "cherries", label: "Cherries", glyph: "🍒", keywords: "cherry" },
      { id: "peach", label: "Peach", glyph: "🍑", keywords: "apricot nectarine" },
      { id: "mango", label: "Mango", glyph: "🥭", keywords: "tropical" },
      { id: "pineapple", label: "Pineapple", glyph: "🍍", keywords: "tropical" },
      { id: "coconut", label: "Coconut", glyph: "🥥", keywords: "tropical" },
      { id: "kiwi", label: "Kiwi", glyph: "🥝", keywords: "kiwifruit" },
      { id: "melon", label: "Melon", glyph: "🍈", keywords: "cantaloupe honeydew" },
      { id: "avocado", label: "Avocado", glyph: "🥑" },
      { id: "olive", label: "Olive", glyph: "🫒" },
      { id: "tomato", label: "Tomato", glyph: "🍅" },
    ],
  },
  {
    name: "Flavour",
    icons: [
      { id: "mint", label: "Mint", glyph: "🌿", keywords: "herb menthol leaf fresh" },
      { id: "leaf", label: "Leaf", glyph: "🍃", keywords: "green natural" },
      { id: "chocolate", label: "Chocolate", glyph: "🍫", keywords: "cocoa" },
      { id: "candy", label: "Candy", glyph: "🍬", keywords: "sweet sugar" },
      { id: "lollipop", label: "Lollipop", glyph: "🍭", keywords: "sweet" },
      { id: "honey", label: "Honey", glyph: "🍯", keywords: "sweet" },
      { id: "ice-cream", label: "Ice cream", glyph: "🍦", keywords: "vanilla cream" },
      { id: "cookie", label: "Cookie", glyph: "🍪", keywords: "biscuit" },
      { id: "coffee", label: "Coffee", glyph: "☕", keywords: "espresso mocha" },
      { id: "tea", label: "Tea", glyph: "🍵", keywords: "green matcha" },
      { id: "bubble-tea", label: "Bubble tea", glyph: "🧋", keywords: "boba" },
      { id: "cupcake", label: "Cupcake", glyph: "🧁", keywords: "cake vanilla" },
      { id: "doughnut", label: "Doughnut", glyph: "🍩", keywords: "donut glazed" },
      { id: "peanuts", label: "Peanuts", glyph: "🥜", keywords: "nut butter" },
      { id: "chestnut", label: "Chestnut", glyph: "🌰", keywords: "nut hazelnut" },
      { id: "chilli", label: "Chilli", glyph: "🌶️", keywords: "hot spicy pepper" },
      { id: "vanilla", label: "Vanilla flower", glyph: "🌼", keywords: "vanilla floral" },
      { id: "rose", label: "Rose", glyph: "🌹", keywords: "floral" },
    ],
  },
  {
    name: "Size & fit",
    icons: [
      { id: "tshirt", label: "T-shirt", glyph: "👕", keywords: "top tee" },
      { id: "hoodie", label: "Hoodie", glyph: "🧥", keywords: "jacket coat" },
      { id: "trousers", label: "Trousers", glyph: "👖", keywords: "jeans pants" },
      { id: "dress", label: "Dress", glyph: "👗" },
      { id: "shorts", label: "Shorts", glyph: "🩳" },
      { id: "socks", label: "Socks", glyph: "🧦" },
      { id: "cap", label: "Cap", glyph: "🧢", keywords: "hat" },
      { id: "shoe", label: "Shoe", glyph: "👟", keywords: "sneaker trainer" },
      { id: "bag", label: "Bag", glyph: "👝", keywords: "pouch" },
      { id: "ruler", label: "Ruler", glyph: "📏", keywords: "size measure length" },
      { id: "scales", label: "Scales", glyph: "⚖️", keywords: "weight grams" },
    ],
  },
  {
    name: "Marks",
    icons: [
      { id: "star", label: "Star", glyph: "⭐", keywords: "favourite best" },
      { id: "sparkles", label: "Sparkles", glyph: "✨", keywords: "new shiny" },
      { id: "fire", label: "Fire", glyph: "🔥", keywords: "hot popular" },
      { id: "bolt", label: "Bolt", glyph: "⚡", keywords: "strong power energy" },
      { id: "crown", label: "Crown", glyph: "👑", keywords: "premium best" },
      { id: "gem", label: "Gem", glyph: "💎", keywords: "premium quality" },
      { id: "heart", label: "Heart", glyph: "❤️", keywords: "love favourite" },
      { id: "snowflake", label: "Snowflake", glyph: "❄️", keywords: "cool cold ice" },
      { id: "droplet", label: "Droplet", glyph: "💧", keywords: "water liquid wet" },
      { id: "moon", label: "Moon", glyph: "🌙", keywords: "night" },
      { id: "sun", label: "Sun", glyph: "☀️", keywords: "day bright" },
      { id: "rainbow", label: "Rainbow", glyph: "🌈", keywords: "colour multi" },
    ],
  },
];

export const ATTRIBUTE_ICONS: AttributeIcon[] = ATTRIBUTE_ICON_GROUPS.flatMap(
  (g) => g.icons,
);

const BY_ID = new Map(ATTRIBUTE_ICONS.map((i) => [i.id, i]));

/** The stored id back to its icon, or null if the set has moved on. */
export function iconById(id: string | null | undefined): AttributeIcon | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** The glyph to draw, falling back to nothing rather than a broken box. */
export function iconGlyph(id: string | null | undefined): string {
  return iconById(id)?.glyph ?? "";
}

/** Ids only, for validating what a form sent. */
export function isKnownIcon(id: string | null | undefined): boolean {
  return !!id && BY_ID.has(id);
}

/** Matches on label, id and keywords, so "sour" finds the lemon. */
export function searchIcons(query: string): AttributeIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return ATTRIBUTE_ICONS;
  return ATTRIBUTE_ICONS.filter((i) =>
    `${i.label} ${i.id} ${i.keywords ?? ""}`.toLowerCase().includes(q),
  );
}
