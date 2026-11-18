# Br3thr logo: usage guide

## The marks
| Mark | File | Use it for |
|---|---|---|
| **Seal** (primary) | `final/br3thr-seal.svg`, `-reversed.svg` | Packaging, stickers, shipping labels, login screen, social avatar, anywhere 64px or larger |
| **Icon** | `final/br3thr-icon.svg` (black tile), `-reversed.svg`, `-plain.svg` | Favicon, app icon, admin rail, anything below 64px |
| **Wordmark** | `final/br3thr-wordmark.svg`, `-reversed.svg` | Headers, documents, beside the icon |
| **Lockup** | `final/br3thr-lockup.svg`, `-reversed.svg` | Wide spaces: email headers, invoices, banners |

The idea: the squared 3 doubles as a mirrored E (BR3THR also reads BRETHR); the seal rim
repeats the name. The logo is black and white only.

## Colour
| | HEX | RGB |
|---|---|---|
| Ink | `#0B0B0B` | 11 11 11 |
| White | `#FFFFFF` | 255 255 255 |

The logo has no colour accent: ink on light, white on dark. (The admin theme's red stays a UI accent, not part of the logo.)

## Rules
- **Clear space:** keep space equal to the height of the 3's middle bar on every side.
- **Minimum sizes:** seal 64px / 18mm; wordmark 80px wide; below that, use the icon.
- **Backgrounds:** ink on white or light; reversed (white) on black or dark photos with enough contrast.
- **Don't:** recolour the 3, put it in a red ring (it reads as a speed-limit sign),
  set the name in a font instead of using the wordmark file, stretch, add shadows or gradients,
  put the seal on a busy background.

## Files in the app
`public/br3thr/`: `logo-480.png` and `logo.png` (white seal, used by the storefront, emails and login),
`seal-reversed.svg`, `icon-reversed.svg`, `wordmark-reversed.svg` (admin rail),
`favicon.ico`, `favicon-192.png`, `favicon-512.png`, `apple-touch-icon.png`; also `public/favicon.ico`.
Full web icon set and manifest: `final/web/`. The old Godfather files are kept in `old-godfather/`.

## Notes
- All letters are constructed paths (no font licence needed). Rebuild with `python build_final.py`.
- Trademark availability has not been checked; get a professional search before registering.
