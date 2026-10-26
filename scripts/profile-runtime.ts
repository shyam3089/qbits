import ts from 'typescript';
/** Instrument framework function declarations, never application source. */
export function instrumentRuntime(source:string):string {
  const file=ts.createSourceFile('runtime.js',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS),factory=ts.factory;
  const transformed=ts.transform(file,[context=>{
    const visit:ts.Visitor=node=>{
      const visited=ts.visitEachChild(node,visit,context);
      if(ts.isFunctionDeclaration(visited)&&visited.body&&visited.name){const call=(method:string,args:ts.Expression[])=>factory.createExpressionStatement(factory.createCallExpression(factory.createPropertyAccessExpression(factory.createPropertyAccessExpression(factory.createIdentifier('globalThis'),'__qbProbe'),method),undefined,args));
        return factory.updateFunctionDeclaration(visited,visited.modifiers,visited.asteriskToken,visited.name,visited.typeParameters,visited.parameters,visited.type,factory.createBlock([call('enter',[factory.createStringLiteral(visited.name.text)]),factory.createTryStatement(visited.body,undefined,factory.createBlock([call('exit',[])]))]));}
      return visited;
    };
    return root=>ts.visitNode(root,visit) as ts.SourceFile;
  }]);
  try{return ts.createPrinter().printFile(transformed.transformed[0]);}finally{transformed.dispose();}
}
