# Phase 1 syntax

This indentation-based subset follows the founder's approved correction and replaces
the provisional brace grammar entirely. Legacy brace syntax is rejected.

```text
component Counter:
    count = 0
    button text="Count: " + str(count):
        on click:
            count = count + 1
```

```ebnf
component = "component", identifier, ":", NEWLINE, INDENT, state, button, DEDENT, EOF ;
state = identifier, "=", integer, NEWLINE ;
button = "button", "text", "=", string, "+", "str", "(", identifier, ")",
         ":", NEWLINE, INDENT, "on", "click", ":", NEWLINE, INDENT,
         identifier, "=", identifier, "+", integer, NEWLINE, DEDENT, DEDENT ;
```

Exactly one component, one numeric local state, and one button are supported.
`str(value)` explicitly converts the declared numeric state to text; Phase 1 supports
it only in `button text=string + str(state)`. Each click adds the integer step and
updates the same text node. All references must match the state declaration.
Arbitrary expressions and function calls are unsupported.

Indentation defines blocks. Each header ends with a colon. Use spaces only; the
first indented code line establishes the width (four spaces recommended). Every
deeper block adds exactly that width. Dedents must return to an existing level.
Top-level code starts in column one. Tabs outside strings/comments are errors,
including tabs in leading whitespace on blank lines. Blank and `#` comment-only
lines emit no tokens and do not affect indentation. Trailing `#` comments are
supported. Comment text and string contents do not participate in indentation checks.

Newlines end statements; the final newline is optional. LF, CRLF, and CR work.
Semicolons, block braces, brace interpolation, declaration keywords, multiline
strings, and line continuations are unsupported. Braces/semicolons inside strings
are ordinary literal text. Identifiers use ASCII letters/underscore followed by
letters/digits/underscore; syntax words and `var`, `let`, `const` are reserved.
Integers are nonnegative safe integers; strings use JSON double-quoted escaping.
Imports, HTML syntax, and application JavaScript are deferred. Parsing never executes source.

Spans use zero-based UTF-16 offsets with exclusive ends; diagnostics use one-based
lines/columns. NEWLINE covers the physical ending or is zero-width at EOF. INDENT
covers leading spaces; DEDENT is zero-width at the next code token or EOF. Block
spans end at their final statement, excluding trailing comments.
