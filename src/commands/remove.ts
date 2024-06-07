const vscode = require('vscode');
const t = require('@babel/types');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;

const isValidDocumentLanguage = (document: any) => {
    return document.languageId.includes('javascript');
};

module.exports = () => {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor) {
        return;
    }

    if (!isValidDocumentLanguage(activeTextEditor.document)) {
        return;
    }

    const code = activeTextEditor.document.getText();

    // const code = `
    //     import moment from 'moment';
    //     import React, {useState} from 'react';
    //     import { formatColumns, handleColumns } from '@src/utils/variable-handler';
    //     import { useColSearch } from '@S0060013.01/cbs-common-hooks';
    //     const Test = () => {
    //         const [count, setCount] = useState(1)
    //         React()
    //         useColSearch()
    //         formatColumns()
    //         const arr1 = [1, 2]
    //         const arr2 = [3, 4, 5]
    //         const obj = {name: 'can', age: 8}
    //         const {name, age} = obj

    //         console.log(age)

    //         return (
    //             <div onClick={()=> setCount(3)}>{arr2.map(item => <span>{item}</span>)}</div>
    //         )
    //     }

    //     export default Test;
    // `;
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: [
            "jsx",
            "typescript"
        ]
    });

    traverse(ast, {
      // 处理const/let/var定义的变量
      VariableDeclaration(path: any) {
          const {node} = path;
          const {declarations} = node;
          node.declarations = node.declarations.filter((declaration: any) => {
              const { id } = declaration;
              // 处理对象解构的场景 const {name, age} = obj
              if (t.isObjectPattern(id)) {
                  id.properties = id.properties.filter((property: any) => {
                      const binding = path.scope.getBinding(property.key.name);
                      return !!binding.referenced;
                  });
                  return id.properties.length > 0;
              // 处理数组解构的场景 const [count, setCount] = useState(1)
              } else if (t.isArrayPattern(id)) {
                  // 如果解构元素中，有一个有被引用，则整个表达式不能被删除
                  let result: boolean[] = [];
                  id.elements.forEach((element: any) => {
                      const binding = path.scope.getBinding(element.name);
                      result.push(!!binding.referenced);
                  });
                  result = result.filter(Boolean);
                  return result.length > 0;
              // 处理普通变量
              } else {
                  const binding = path.scope.getBinding(id.name);
                  return !!binding?.referenced;
              }
          });
          if (node.declarations.length === 0) {
              path.remove();
          }
      },
      // 处理import导入的变量
      ImportDeclaration(path: any) {
          const {node} = path;
          const {specifiers} = node;
          node.specifiers = specifiers.filter((specifier: any) => {
              // 变量名在specifier.local.name
              const {local} = specifier;
              // 获取改名称绑定的信息
              const binding = path.scope.getBinding(local.name);
              // binding?.referenced是否被引用
              return !!binding?.referenced;
          });
          // 如果整个表达式没有被引用，则把整个表达式删除
          if (node.specifiers.length === 0) {
              path.remove();
          }
      }
  });

  // console.log('generator(ast).code', generator(ast).code);
  activeTextEditor.edit((editBuilder: any) => {
      editBuilder.replace(
          new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(activeTextEditor.document.lineCount + 1, 0)
          ),
          generator(ast).code
      );
  });
};