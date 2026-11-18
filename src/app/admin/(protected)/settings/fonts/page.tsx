import type { Metadata } from "next";
import {
  BUILTIN_BODY_FONTS,
  BUILTIN_DISPLAY_FONTS,
  HEADING_SAME_AS_BODY,
} from "@/lib/store-font-options";
import { requireCapability } from "@/lib/permissions";
import { getSettings, SETTING_KEYS } from "@/lib/settings";
import { listFonts, groupFamilies, fontFaceCss } from "@/lib/fonts";
import { SectionCard, Field, fieldSelect } from "@/components/admin/Field";
import { btnPrimary } from "@/components/admin/ui";
import { IconTrash } from "@/components/admin/Icons";
import { FontUploader } from "@/components/admin/FontUploader";
import { deleteFontFile, saveFontChoice } from "./actions";

export const metadata: Metadata = { title: "Fonts" };
export const dynamic = "force-dynamic";

function size(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function FontsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireCapability("appearance");
  const [{ saved }, s, fonts] = await Promise.all([
    searchParams,
    getSettings(),
    listFonts(),
  ]);

  const families = groupFamilies(fonts);
  const names = families.map((f) => f.family);

  return (
    <div className="max-w-3xl space-y-5">
      {/* The uploaded faces are loaded here too, so the list below and the
          picker preview show each font in itself rather than in the admin's. */}
      {fonts.length > 0 ? (
        <style dangerouslySetInnerHTML={{ __html: fontFaceCss(fonts) }} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Fonts</h1>
        {saved ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Saved
          </span>
        ) : null}
      </div>
      <p className="-mt-2 text-sm text-slate-500">
        Upload a font and use it across the storefront.
      </p>

      <SectionCard title="Upload a font">
        <FontUploader families={names} />
        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
          <p>
            <strong className="text-slate-700">woff2</strong> is the format to
            use &mdash; roughly half the size of ttf for identical rendering,
            and supported by every browser in use. woff, ttf and otf also work.
            3 MB per file.
          </p>
          <p className="mt-2.5">
            Upload one file per weight you actually need, entering the{" "}
            <em>same font name</em> each time &mdash; typically Regular (400)
            and Bold (700). Without a real bold file the browser will smear the
            regular one into a fake bold, which looks visibly wrong.
          </p>
          <p className="mt-2.5">
            Check your licence covers web use before uploading. A desktop
            licence usually doesn&rsquo;t.
          </p>
        </div>
      </SectionCard>

      <SectionCard title={`Installed fonts (${families.length})`}>
        {families.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nothing uploaded yet. The shop is using its built-in Public Sans.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {families.map((f) => (
              <li key={f.family} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{f.family}</p>
                  <p className="text-xs text-slate-400">
                    {f.files.length} file{f.files.length === 1 ? "" : "s"}
                  </p>
                </div>

                <p
                  className="mt-2 text-2xl text-slate-800"
                  style={{ fontFamily: `"${f.family}", sans-serif` }}
                >
                  The quick brown fox jumps over the lazy dog
                </p>

                <ul className="mt-3 space-y-1.5">
                  {f.files.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2"
                    >
                      <span className="text-xs font-medium text-slate-700">
                        {file.weight}
                        {file.style === "italic" ? " italic" : ""}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                        {file.filename} &middot; {file.format} &middot; {size(file.sizeBytes)}
                      </span>
                      <form action={deleteFontFile}>
                        <input type="hidden" name="id" value={file.id} />
                        <button
                          type="submit"
                          aria-label={`Delete ${f.family} ${file.weight}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <form action={saveFontChoice}>
        <SectionCard title="Use them">
          <div className="grid grid-cols-1 gap-x-5 gap-y-7 md:grid-cols-2">
            <Field label="Body font" htmlFor="bodyFont">
              <select
                id="bodyFont"
                name="bodyFont"
                defaultValue={s[SETTING_KEYS.bodyFont]}
                className={fieldSelect}
              >
                <option value="">Inter (default)</option>
                <optgroup label="Built in">
                  {BUILTIN_BODY_FONTS.filter((f) => f.value !== "builtin-inter").map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Heading font" htmlFor="headingFont">
              <select
                id="headingFont"
                name="headingFont"
                defaultValue={s[SETTING_KEYS.headingFont]}
                className={fieldSelect}
              >
                <option value="">Bungee (logo theme, default)</option>
                <option value={HEADING_SAME_AS_BODY}>Same as body</option>
                <optgroup label="Built in">
                  {BUILTIN_DISPLAY_FONTS.filter((f) => f.value !== "builtin-bungee").map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3.5 text-xs leading-relaxed text-slate-500">
            Body font replaces the typeface everywhere on the storefront.
            Heading font applies to page and section titles, so a display face can sit
            over a readable body face. The admin panel keeps its own font
            either way. Reverting to the built-in font is one selection &mdash;
            nothing is deleted.
          </p>

          <div className="mt-7 flex justify-end">
            <button type="submit" className={btnPrimary}>
              Save
            </button>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}
