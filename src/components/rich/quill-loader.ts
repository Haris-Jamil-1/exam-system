// Lazy-load boundary for Quill — mirrors katex-loader.ts's discipline: nothing may import this
// module statically, so Quill's JS and stylesheet only ship to a page that's actually authoring a
// question (the item builder), never to the far more common read-only surfaces (student exam
// page, every review/results page, bank/admin previews).
import Quill from 'quill';
import Embed from 'quill/blots/embed';
import 'quill/dist/quill.snow.css';

export interface FormulaValue {
  latex: string;
  display: boolean;
}

/**
 * Custom "formula" blot. Deliberately does NOT use Quill's own stock `formats/formula` (which
 * requires a global `window.katex` and calls `katex.render()` with no `trust`/`strict` options at
 * all — a real XSS surface baked into Quill's default module, since a crafted `\href{javascript:
 * ...}` would execute in-editor). This blot only ever stores the raw LaTeX + display-mode as data
 * attributes and shows a plain, inert text label inside the editor itself; the one and only place
 * this app trusts to turn LaTeX into markup remains `MathSegment.tsx` (via `katex-loader.ts`,
 * `trust: false`) — every render of saved content re-extracts these attributes and re-renders
 * through that exact, already-hardened path (see `rich-html.ts`) rather than trusting whatever a
 * rich-text editor serialized inline.
 */
class FormulaBlot extends Embed {
  static blotName = 'formula';
  static tagName = 'span';
  static className = 'ql-formula';

  static create(value: FormulaValue): HTMLElement {
    const node = super.create(value) as HTMLElement;
    node.setAttribute('data-latex', value.latex);
    node.setAttribute('data-display', String(value.display));
    node.setAttribute('contenteditable', 'false');
    node.textContent = value.display ? `[ ${value.latex} ]` : `⟨${value.latex}⟩`;
    return node;
  }

  static value(node: HTMLElement): FormulaValue {
    return {
      latex: node.getAttribute('data-latex') ?? '',
      display: node.getAttribute('data-display') === 'true',
    };
  }
}

Quill.register(FormulaBlot, true);

export default Quill;
