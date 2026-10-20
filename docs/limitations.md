<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Limitations

Phase 2A supports nested standard elements, numeric local states, click increments,
read-only string/number/boolean props with literal defaults, static classes, relative
component imports and ordinary external CSS. One default component per file.
class forwarding requires a single resolved root; no wrappers are created.
No forms/binding, conditionals, loops, arbitrary calls, routing, SSR, plugins,
LSP/editor extensions, native targets or registry. Numeric literals are nonnegative safe integers.
Only text/class attributes and button click handlers are supported; component children/slots are deferred.
Development uses automatic full reload after source edits, including error recovery.
Component HMR and state preservation do not exist; state resets on reload.
Diagnostics preserve source locations; generated JavaScript source maps are deferred.
Packages remain private/unpublished; license selection and external names are pending.
