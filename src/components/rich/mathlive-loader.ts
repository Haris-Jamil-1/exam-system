// Lazy-load boundary for MathLive (the visual equation editor, teacher side only). Nothing may
// import this module's *runtime* value statically — the `import('mathlive')` below is the only
// reference, so MathLive (~1MB of JS plus a web-component registration) is fetched exactly once,
// the first time a teacher opens the equation dialog. No student taking an exam ever loads it.
// The `import(...)` in the type alias is type-only and erased at compile time.

type MathfieldConstructor = (typeof import('mathlive'))['MathfieldElement'];

let configured = false;

/**
 * Resolves the `MathfieldElement` constructor with assets pointed at our own origin.
 *
 * Fonts are self-hosted under `public/mathlive/fonts/` (copied from the npm package) rather than
 * left on MathLive's default page-relative `./fonts` path, which would 404 on every route. This
 * also means zero external network calls, matching how `public/models/` already self-hosts the
 * proctoring model weights. The middleware needs no change: its `STATIC_ASSET_RE` already lets
 * `.woff2` through, which is exactly the generalisation added when `/models/*` was being
 * role-redirected to HTML.
 *
 * Sounds are disabled outright — keypress audio in an exam-authoring tool is noise, and turning it
 * off avoids serving the .wav files at all.
 */
export async function loadMathfieldElement(): Promise<MathfieldConstructor> {
  const mathlive = await import('mathlive');
  if (!configured) {
    mathlive.MathfieldElement.fontsDirectory = '/mathlive/fonts';
    mathlive.MathfieldElement.soundsDirectory = null;
    configured = true;
  }
  return mathlive.MathfieldElement;
}
