import React from 'react';
import { glyphPath } from '../lib/icons.ts';

/* Static twin of the runtime icon layer (lib/icons.ts make()): renders the same
   official Material Symbols fill paths as an inline SVG inside the same
   aria-hidden span, so the markup ships without the icon font and hydrate()
   leaves it alone (a span that already contains an svg is skipped). Sizing
   stays with the stylesheets (.material-symbols-outlined svg rules); the
   width/height attributes are only the intrinsic 20×20 fallback. Color
   follows currentColor via fill, exactly like the runtime-injected svgs. */
export default function IconGlyph({ name }: { name: string }) {
  const body = glyphPath(name);
  return <span className="material-symbols-outlined" aria-hidden="true">{body && <svg viewBox="0 -960 960 960" width="20" height="20" focusable="false" fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />}</span>;
}
