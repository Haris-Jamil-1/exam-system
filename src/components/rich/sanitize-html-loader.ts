// Lazy-load boundary for DOMPurify — mirrors katex-loader.ts's discipline: nothing may import
// this module statically, so DOMPurify's bundle only loads the first time a field actually
// contains real editor-authored HTML (RichText's `looksLikeRichHtml` gate decides that; every
// pre-existing plain/legacy-markup row never reaches this module at all).
//
// Formula blots (src/components/rich/quill-loader.ts's custom "formula" embed) are extracted and
// replaced with a placeholder token BEFORE this sanitizer runs (see rich-html.ts) — so the
// allowlist here only ever needs to cover ordinary rich-text markup, never KaTeX's own generated
// output.
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's',
  'ol', 'ul', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'img',
];
const ALLOWED_ATTR = ['src', 'alt'];

// The tag/attribute allowlist above says an `img` may HAVE a `src` — it says nothing about what
// that src is allowed to point at. Left unrestricted, a stray `<img src="https://evil.example/
// x.png">` sanitizes cleanly and silently loads an arbitrary external URL from every viewer's
// browser (no XSS, but a real tracking-pixel/beaconing leak — timing, IP, user-agent). The only
// legitimate writer of an `<img>` at all is QuillEditor's own image button (quill-loader.ts /
// upload-item-image.ts), which always inserts a URL this app's own upload endpoint just returned
// — so every genuine `src` is a public-bucket URL under our own Supabase project. Anything else
// is either a bug upstream of here or tampering, and either way should be dropped, not rendered.
const UPLOAD_PATH_PREFIX = '/storage/v1/object/public/item-assets/';

function uploadOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
  } catch {
    return null;
  }
}

/** Exported for unit testing — pure, no DOM/DOMPurify dependency. */
export function isAllowedImageSrc(src: string): boolean {
  const origin = uploadOrigin();
  if (!origin) return false;
  try {
    const url = new URL(src, origin);
    return url.origin === origin && url.pathname.startsWith(UPLOAD_PATH_PREFIX);
  } catch {
    return false;
  }
}

let hooked = false;
function ensureImageSrcHook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (node.tagName === 'IMG' && data.attrName === 'src' && !isAllowedImageSrc(data.attrValue)) {
      data.keepAttr = false;
    }
  });
}

export function sanitizeRichHtml(html: string): string {
  ensureImageSrcHook();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
