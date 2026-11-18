# Design: Br3thr admin, "Contact Sheet"

> Draft written at the design-system checkpoint. It is re-derived from the
> finished build by the documenter at the end of the redesign.

## World
A black-and-white photographer's proof sheet. The rail is the black film edge;
the workspace is the white sheet; panels are frames on one hairline grid. Data
that is read character by character (order numbers, SKUs, counts) is set in
small mono "edge codes". Red china-marker wax pencil marks what needs a person.
Dark mode is the negative of the same sheet.

Mode: Operate. The world lends type, palette, density and one signature move
(the wax-pencil mark). Navigation, controls and layout stay standard web patterns.

## Colour
Black and white base; colour does jobs only.

| Token | Light | Dark | Job |
|---|---|---|---|
| `--admin-canvas` | `#FFFFFF` | `#0E0E0D` | page ground (the sheet) |
| `--admin-surface` | `#FFFFFF` | `#141413` | panels |
| `--admin-inset` | `#F7F7F5` | `#1B1B1A` | wells, table heads, former pastel grounds |
| `--admin-line` / `-strong` | `#E4E4E1` / `#CFCFCB` | `#2A2A28` / `#3A3A37` | hairline grid |
| `--admin-sidebar` | `#0B0B0B` | `#000000` | film-black rail |
| `--admin-btn` / `-ink` | `#0B0B0B` / `#FFF` | `#F4F4F2` / `#0E0E0D` | primary action |
| `--cs-mark` | `#D2402B` | `#E0563F` | wax pencil: current page dot, focus ring, the one marked item |
| `--cs-mark-text` | `#B5341F` | `#EF8A77` | red used as text (AA) |
| `--cs-plate` / `-ink` | `#0B0B0B` / `#FFF` | `#F4F4F2` / `#0E0E0D` | the one reversed plate per screen |

Neutral ramp (Tailwind `slate-*` is redefined inside the admin): 50 `#F7F7F5`,
100 `#EFEFEC`, 200 `#E4E4E1`, 300 `#CFCFCB`, 400 `#73736D`, 500 `#5F5F5A`,
600 `#4B4B47`, 700 `#373734`, 800 `#232321`, 900 `#121211`. Dark reverses it.

Status keeps a muted hue and always has a text label: emerald = done or paid,
amber = waiting, red = failed or danger, sky = info. Values live in
`contact-sheet.css`.

Rules: red never fills large areas and never marks more than one item per
screen. No gradients, no pastel section grounds, no coloured side borders.

## Type
- **Schibsted Grotesk** (400/500/600/700): all reading text, headings and figures. Rank comes from weight and case, not from many sizes.
- **JetBrains Mono** (400/500): edge codes only, for IDs, SKUs, counts and dates. Never decoration.
- Tabular numerals in tables and figures. No kicker labels above headings.

## Shape and depth
Radius 6px (panels) and 4px (controls). Flat: panels are separated by 1px
hairlines, not shadows. Only floating layers (menus, popovers, dialogs) carry
`--admin-shadow-lg`.

## Signature move
The wax-pencil mark: a hand-drawn red loop or dot on the single thing that
needs a person (the current page in the rail, the order awaiting payment, focus).

## Schemes
Light, dark and auto per browser (cookie `br3thr_admin_scheme`, default auto =
OS setting), switched from the top bar without a reload. Implementation:
`src/lib/admin-scheme.ts`, `src/components/admin/SchemeToggle.tsx`.

## Files
- `src/components/admin/contact-sheet.css`: all tokens and theme rules.
- `src/lib/admin-fonts.ts`: the two faces (admin only).
- `src/app/admin/(protected)/layout.tsx`: sets `data-cs`, the scheme and the fonts.
