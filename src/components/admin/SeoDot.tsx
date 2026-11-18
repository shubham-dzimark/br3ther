import type { SeoHealth } from "@/lib/seo-templates";

const TONE: Record<SeoHealth["tone"], string> = {
  good: "bg-[#7DC244]",
  ok: "bg-[#B4802A]",
  bad: "bg-[#E5484D]",
};

/**
 * Traffic light for a listing column.
 *
 * Green means this item has its own title and description; amber means it is
 * falling back to the type's default template, which is fine but generic; red
 * means it will publish without one.
 *
 * Deliberately about the fields rather than the writing. A dot that claimed to
 * grade keyword use would be guessing, and a wrong grade is worse than none.
 */
export function SeoDot({ health }: { health: SeoHealth }) {
  return (
    <span
      title={health.label}
      aria-label={`SEO: ${health.label}`}
      className={`inline-block h-2.5 w-2.5 rounded-full ${TONE[health.tone]}`}
    />
  );
}
