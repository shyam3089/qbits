export interface CompilerLimits {
  /** Maximum UTF-16 code units accepted from one source file. */
  maxSourceLength:number;
  /** Maximum indentation/view nesting levels in one source file. */
  maxNestingDepth:number;
  /** Maximum expression nodes parsed across one source file. */
  maxExpressionNodes:number;
  /** Maximum recursively nested expression levels. */
  maxExpressionDepth:number;
  /** Maximum items in one list literal or call argument list. */
  maxCollectionItems:number;
}

export const defaultCompilerLimits:Readonly<CompilerLimits>=Object.freeze({
  maxSourceLength:2*1024*1024,
  maxNestingDepth:256,
  maxExpressionNodes:100_000,
  maxExpressionDepth:512,
  maxCollectionItems:100_000
});

export function resolveCompilerLimits(overrides:Partial<CompilerLimits>={}):CompilerLimits {
  const resolved={...defaultCompilerLimits,...overrides};
  for(const [name,value] of Object.entries(resolved))if(!Number.isSafeInteger(value)||value<1)throw new TypeError(`Compiler limit ${name} must be a positive safe integer`);
  return resolved;
}
