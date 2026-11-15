# Qbits syntax highlighting

Qbits publishes editor-neutral TextMate assets in `editor/`:

- `qbits.tmLanguage.json` provides the `source.qbits` grammar for `.qb` files.
- `language-configuration.json` provides line comments, brackets, indentation,
  folding, surrounding pairs, and auto-closing pairs.

The grammar assigns standard TextMate semantic scopes and contains no theme or
color settings. Editors and users remain free to map those scopes through their
theme, token color customizations, or a future Qbits-specific semantic layer.

## Reuse in VS Code-compatible editors

An editor extension can copy the two JSON files or reference them from an installed
`qbits` package. Its `package.json` contribution is:

```json
{
  "contributes": {
    "languages": [
      {
        "id": "qbits",
        "aliases": ["Qbits", "qbits"],
        "extensions": [".qb"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "qbits",
        "scopeName": "source.qbits",
        "path": "./qbits.tmLanguage.json"
      }
    ]
  }
}
```

Copying these assets does not require the Qbits compiler or runtime. Extension
packaging, icons, themes, language servers, snippets, and semantic token providers
are intentionally outside Stage 6A.

## Framework-owned code displays

Web documentation and examples can use the opt-in browser highlighter. The module
loads the TextMate engine only when one of its asynchronous functions is called, so
the compiler and runtime bundles do not include highlighting code.

```ts
import {highlightQbitsElement} from 'qbits/highlight';
import 'qbits/highlight.css';

const code = document.querySelector<HTMLElement>('[data-qbits-code]');
if (code) void highlightQbitsElement(code);
```

`highlightQbits(source)` returns escaped highlighted markup for documentation
renderers. `tokenizeQbits(source)` returns tokens and TextMate scopes without HTML.
The DOM helper creates text nodes and fixed-class spans; it does not insert source as
HTML. Highlighting input is bounded to 1,000,000 UTF-16 code units.

The stylesheet follows the operating-system color scheme and supports explicit
`data-qbits-theme="light"` or `data-qbits-theme="dark"` on the code block or an
ancestor. Every color is a `--qbits-code-*` custom property, so applications can
override the palette without replacing the tokenizer or grammar.

## Scope contract

The grammar uses conventional scope families so existing themes work without Qbits
colors: `keyword.*`, `storage.type.*`, `entity.name.type.*`,
`entity.name.function.*`, `variable.parameter.*`, `variable.other.property.*`,
`support.type.*`, `support.function.*`, `string.*`, `constant.*`, `comment.*`,
`keyword.operator.*`, and `punctuation.*`.

Highlighting is contextual for declarations, events, control-flow headers, HTTP
configuration, and directives. Keyword matches use identifier boundaries, while
strings and comments take precedence, preventing keyword coloring inside those
regions.
