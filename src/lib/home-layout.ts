export type HomeLayout = "classic" | "banner";

/**
 * The homepage chosen in Home page control, from the stored "home.layout"
 * value. Anything but an explicit "banner" - unset, blank, a typo - is the
 * classic page, so a bad value can never leave the shop without a homepage.
 */
export function homeLayout(saved: string | null | undefined): HomeLayout {
  return saved?.trim() === "banner" ? "banner" : "classic";
}
