# Phase 2A syntax

One default component is declared per file. Imports precede the component.
The Phase 1 counter remains valid:

```text
component Counter:
    count = 0
    button text="Count: " + str(count):
        on click:
            count = count + 1
```

Props are named, read-only, and have literal defaults. Types are inferred as
string, number, or boolean. Numeric literals currently remain nonnegative safe
integers. Multiple props use commas inside the component header; commas do not
terminate statements. Local numeric state declarations precede root elements.

```text
import "./Counter.css"

component Counter(label = "Count: ", step = 1, enabled = true):
    count = 0
    div class="counter":
        button class="counter-button" text=label + str(count):
            on click:
                count = count + 1
```

Relative default imports use the configured source extension; see the generated
[example](examples.md) for the current identity. An imported component is instantiated
by its local import name. Named attributes supply props. Omitted props retain defaults.
Unknown props, incompatible value types, and assignments to props are errors.
Component instances cannot accept children, slots, or event handlers in this phase.

Supported standard elements: main, section, div, h1–h6, p, span, label, button.
Elements may nest using colon blocks or end at a newline when they have no children
or handler. Attributes are `text=expression` and static `class="space separated classes"`.
`text` requires a string and creates a text node, never HTML. Expressions are literals,
state/prop references, `str(reference)`, and addition of two strings or two numbers.
Mixed additions require explicit `str`. Arbitrary calls and JavaScript are unsupported.
Only buttons accept `on click` blocks, containing one numeric state increment:
`target = operand + integer`. Each instance owns its state, bindings and listeners.

`class` on a component instance forwards to its single resolved root element,
merging with existing classes and retaining defaults. Duplicate classes are removed.
Multiple roots are allowed without forwarding; ambiguous forwarding is diagnosed,
including through components whose root is another component. No wrappers are added.
`class` is reserved and cannot be a declared prop.

Side-effect imports accept relative `.css` files using ordinary standard CSS syntax.
Component modules use normal imports and Vite resolution; missing files, incorrect
source extensions, and component import cycles are diagnosed. No application code
is executed while compiling. The pure compiler accepts optional component metadata
for cross-file prop checking; Node tooling performs filesystem graph validation.

Indentation defines blocks. Headers end with a colon. Use spaces only; the first
indented code line establishes the width (four recommended). Every deeper block
adds exactly that width; dedents return to an existing level. Top-level code starts
in column one. Tabs outside strings/comments are errors, including leading tabs on
blank lines. Blank/comment-only lines do not affect indentation. `#` starts a trailing
or whole-line comment. Strings use JSON double-quoted escaping.

Newlines end statements; the final newline is optional. LF, CRLF and CR work.
Braces, semicolons, interpolation, var/let/const, multiline strings and line
continuations are unsupported. Braces/semicolons inside strings are literal text.
Identifiers use ASCII letters/underscore followed by letters/digits/underscore.

Spans use zero-based UTF-16 offsets with exclusive ends; diagnostics use one-based
lines/columns. NEWLINE covers the physical ending or is zero-width at EOF. INDENT
covers leading spaces; DEDENT is zero-width at the next code token or EOF. Block
spans end at their final statement, excluding trailing comments.

Forms/binding, conditionals, loops, routing, SSR, plugins and LSP remain deferred.
Development reloads on component/CSS edits and recovers from located errors.
Reload resets state; state-preserving HMR and generated JavaScript source maps are deferred.
