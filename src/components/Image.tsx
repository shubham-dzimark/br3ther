import NextImage, { type ImageProps } from "next/image";
import { mediaSrc } from "@/lib/media-src";

/**
 * The only image component the site uses. Import this, never `next/image`.
 *
 * Next's image optimiser reads local `/...` files from a snapshot of `public/`
 * taken when the server starts, so anything uploaded after the last restart
 * failed with "The requested resource isn't a valid image" and showed as a
 * broken picture - a new hero slide, a new product photo, a new category tile
 * - until the next deploy happened to restart the service. `mediaSrc()` points
 * the optimiser at the absolute upload URL instead, which Apache serves the
 * moment the file lands.
 *
 * That fix used to be applied by each page that remembered to, and six did
 * not. Doing it here means no image can forget. A deploy check fails if any
 * file imports `next/image` directly again.
 *
 * Works in server and client components alike: no hooks, no state.
 */
export default function Image({ src, alt, ...rest }: ImageProps) {
  return <NextImage {...rest} alt={alt} src={typeof src === "string" ? mediaSrc(src) : src} />;
}
