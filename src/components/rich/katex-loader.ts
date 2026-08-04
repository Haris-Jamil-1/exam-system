// Lazy-load boundary for KaTeX. Nothing may import this module statically — `MathSegment` reaches
// it through `await import('./katex-loader')` so webpack emits KaTeX's JS *and* its stylesheet into
// an async chunk that is only fetched the first time a field actually contains an expression.
// A question with no math never pays for any of it.
//
// The mhchem side-effect import registers the `\ce{...}` / `\pu{...}` macros on the same KaTeX
// instance, which is what makes chemistry work without a second rendering engine.
import katex from 'katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';

export default katex;
