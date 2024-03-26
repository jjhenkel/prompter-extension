// define function that takes a prompt and returns a canonical form

import { PromptTemplateHole, toVSCodePosition } from '.';
import Parser from 'web-tree-sitter';
import * as fs from 'fs';
import { vsprintf } from 'sprintf-js';

export function canonizePrompt(
    sourceFile: string,
    node: Parser.SyntaxNode | null,
    // extensionUri: vscode.Uri
    parser: Parser
): [string, { [key: string]: PromptTemplateHole }] {
    try {
        let templateHoles: { [key: string]: PromptTemplateHole } = {};
        const sourceFileContents = fs.readFileSync(sourceFile, 'utf8');
        // console.log('File loaded');
        const tree = parser.parse(sourceFileContents.toString());
        // get the node's descendants recursively that are strings and identifiers
        const children = node?.descendantsOfType([
            'string_content',
            'identifier',
        ]);
        // get the text of the children
        const childrenValues = children?.map((child) => {
            if (child.type === 'identifier') {
                // try to find the value of the identifier in the source file
                const identifier = child.text;
                const helper = new ASTHelper();
                const value = helper._getIdentifierValue(identifier, tree);
                if (value) {
                    return value;
                } else {
                    templateHoles[identifier] = {
                        name: identifier,
                        inferredType: 'string',
                        rawText: identifier.toString(),
                        startLocation: toVSCodePosition(child.startPosition),
                        endLocation: toVSCodePosition(child.endPosition),
                    } as PromptTemplateHole;
                    return '{' + identifier + '}';
                }
            } else {
                return child.text;
            }
        });

        // if expression is modulo
        if (node?.type === 'binary_operator' && node.children[1].type === '%') {
            if (childrenValues) {
                // return the modulo of the left and right values
                return [
                    vsprintf(childrenValues[0], childrenValues.slice(1)),
                    templateHoles,
                ];
            }
        }
        // assume the default of joining for other cases (addition, redirection, fstring, etc.).
        return [childrenValues?.join('') || '', templateHoles];
    } catch (e) {
        console.log(e);
        return ['', {}];
    }
}

class ASTHelper {
    _processValueNode(
        right: Parser.SyntaxNode | null,
        tree: Parser.Tree
    ): string | undefined {
        // if the right side is a string, return the string without quotes
        if (right?.type === 'string') {
            return right.text.slice(1, -1);
        }
        // if the right side is an identifier, find the value of the identifier
        if (right?.type === 'identifier') {
            return this._getIdentifierValue(right.text, tree);
        }
        // if the right side is a function call, find the value of the function call
        if (right?.type === 'function_call') {
            return this._getFunctionCallValue(right, tree);
        }
        // if the right side is a binary expression, find the value of the binary expression
        if (right?.type === 'binary_expression') {
            return this._getBinaryExpressionValue(right, tree);
        }
        // if the right side is a unary expression, find the value of the unary expression
        if (right?.type === 'unary_expression') {
            return this._getUnaryExpressionValue(right, tree);
        }
        // if the right side is an f-string, find the value of the f-string
        if (right?.type === 'f_string') {
            return this._getFStringValue(right, tree);
        }
        // if the string is a slice, find the value of the string, then slice and return
        if (right?.type === 'slice') {
            const value = this._processValueNode(
                right.childForFieldName('value'),
                tree
            );
            const start = this._processValueNode(
                right.childForFieldName('start'),
                tree
            ) as number | undefined;
            const end = this._processValueNode(
                right.childForFieldName('end'),
                tree
            ) as number | undefined;
            if (value) {
                if (start && end) {
                    return value.slice(start, end);
                }
                if (start) {
                    return value.slice(start);
                }
                if (end) {
                    return value.slice(0, end);
                }
                return value;
            }
        }
        //TODO add more cases
        return undefined;
    }

    _getIdentifierValue(
        identifier: string,
        tree: Parser.Tree
    ): string | undefined {
        const root = tree.rootNode;

        // FOR DEBUGGING
        // export AST to temporary text file
        // const tempFileLocation = vscode.Uri.joinPath(
        // vscode.Uri.parse(__dirname),
        // 'temp.txt'
        // ).fsPath;
        // fs.writeFileSync(tempFileLocation, root.toString());

        const nodes = root.descendantsOfType(['assignment']);
        for (const node of nodes) {
            const left = node.childForFieldName('left');
            const right = node.childForFieldName('right');
            if (left?.text === identifier) {
                return this._processValueNode(right, tree);
            }
        }
        return undefined;
    }

    _getFStringValue(
        right: Parser.SyntaxNode,
        tree: Parser.Tree
    ): string | undefined {
        // get the children of the f-string
        const children = right.children;
        // get the value of the children
        const values = children.map((child) => {
            return this._processValueNode(child, tree);
        });
        return values.join('');
        // throw new Error('Method not implemented.');
    }
    private _getUnaryExpressionValue(
        right: Parser.SyntaxNode,
        tree: Parser.Tree
    ): string | undefined {
        throw new Error('Method not implemented.');
    }

    private _getBinaryExpressionValue(
        right: Parser.SyntaxNode,
        tree: Parser.Tree
    ): string | undefined {
        // get the left and right children of the binary expression
        const left = right.childForFieldName('left');
        const rightNode = right.childForFieldName('right');
        // get the values of the left and right children
        const leftValue = this._processValueNode(left, tree);
        const rightValue = this._processValueNode(rightNode, tree);
        // return the concatenation of the left and right values
        const leftValueString = leftValue?.toString() || '';
        const rightValueString = rightValue?.toString() || '';
        // if operation is addition return the sum of the left and right values
        if (right.text === '+') {
            return leftValueString + rightValueString;
        }
        // if the operation is modulo return the modulo of the left and right values
        if (right.text === '%') {
            // get all the values in the rightNode
            const values = rightNode?.children.map((child) => {
                return this._processValueNode(child, tree);
            });
            if (values) {
                // set undefined values to '' inplace
                values.forEach((value, index) => {
                    if (!value) {
                        values[index] = '';
                    }
                });
                // return the modulo of the left and right values
                return vsprintf(leftValueString, values);
            }
            return leftValueString;
        }
    }

    private _getFunctionCallValue(
        right: Parser.SyntaxNode,
        tree: Parser.Tree
    ): string | undefined {
        //TODO rely on ChatGPT to get the possible values of the function call
        throw new Error('Method not implemented.');
    }
}
