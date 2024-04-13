// define function that takes a prompt and returns a canonical form

import { PromptTemplateHole, toVSCodePosition } from '.';
import Parser from 'web-tree-sitter';
import * as fs from 'fs';
import { vsprintf } from 'sprintf-js';
import { GPTModel, sendChatRequest } from '../LLMUtils';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';

import * as vscode from 'vscode';
export async function canonizeWithTreeSitterANDCopilotGPT(
    sourceFile: string,
    node: Parser.SyntaxNode | null,
    parser: Parser
): Promise<[string, { [key: string]: PromptTemplateHole }]> {
    const [normalizedResponse, temp] = canonizePromptWithTreeSitter(
        sourceFile,
        node,
        parser
    );

    let [finalResponse, templateHoles] = await canonizeWithLLM(
        sourceFile,
        node,
        normalizedResponse
    );
    try {
        // fallback to local parsing in case LLM fails to generate a proper response
        const json_error = JSON.parse(finalResponse);
        if (json_error.error) {
            console.log('Error in canonizeWithTreeSitterANDCopilotGPT');
            console.log(json_error.error_message);
        }
        //canonizeOnlyWithLLM
        [finalResponse, templateHoles] = await canonizeWithLLM(
            sourceFile,
            node
        );
        try {
            const json_error = JSON.parse(finalResponse);
            if (json_error.error) {
                console.log('Error in canonizeWithLLMOnly');
                console.log(json_error.error_message);
            }

            [finalResponse, templateHoles] =
                completeCanonizePromptWithTreeSitter(sourceFile, node, parser);
        } catch (e) {}
    } catch (e) {
        // NOT an error, just a normal flow
    }

    return [finalResponse, templateHoles];
}

export const canonizeWithLLM = async (
    sourceFile: string,
    node: Parser.SyntaxNode | null,
    preNormalizedNodeText: string = ''
    // parser: Parser
): Promise<[string, { [key: string]: PromptTemplateHole }]> => {
    // const LANGUAGE_MODEL_ID = 'copilot-gpt-3.5-turbo';

    // Goal: take the node, convert to a string, shove it in a prompt
    // and to get back a normalized string
    let nodeAsText = preNormalizedNodeText;
    if (nodeAsText === '') {
        nodeAsText = node?.text || '';
    }
    let messages: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: `
# Task

You will be given a Python expression. This is expression yields a string and may do so
via a variety of methods such as string concatenation, string formatting, or string slicing.
You task is to read this and convert it into a normalized string form.

## Instructions

1. Read the Python expression.
2. Note where there are "template holes" things like f'Blah blah {{variable}}' that need to be filled in.
3. Produce as output a single string where any template holes have been normalized to a placeholder like {{variable}}.
4. Any variable that can't be resolved should be converted to a placeholder like {{variable}}.
5. Output only the normalized string, nothing else.
6. If you encounter any problems fulfilling a request, you will start your response with \" I am sorry \"
            `.trim(),
        },
        {
            role: 'system',
            content: `
Here is the Python expression:
\`\`\`python
"The following is a conversation with an AI Customer Segment Recommender. \\
  The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit. \\
  AI, please state a insightful observation about " + prompt_product_desc + "."
\`\`\`
Here is the normalized string:
\`\`\`txt
            `.trim(),
        },
        {
            role: 'system',
            content: `
The following is a conversation with an AI Customer Segment Recommender.
The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit.
AI, please state a insightful observation about {{prompt_product_desc}}.
\`\`\`
            `.trim(),
        },
        {
            role: 'user',
            content: `
Here is the Python expression:
\`\`\`python
${nodeAsText}
\`\`\`
Here is the normalized string:
\`\`\`txt
            `.trim(),
        },
    ];

    const normalizedResponse = await sendChatRequest(
        messages,
        {
            temperature: 0.0,
            stop: ['```'],
            model: GPTModel.GPT3_5Turbo,
        },
        undefined,
        false,
        false
    );

    console.log(normalizedResponse);

    // Also parse out the template holes from the normalized string

    // parse the normalized response to get the template holes surrounded by {{}}
    const templateHoles: { [key: string]: PromptTemplateHole } = {};
    const regex = /{{(.*?)}}/g;
    let match;
    const children = node?.descendantsOfType(['string_content', 'identifier']);

    while ((match = regex.exec(normalizedResponse))) {
        const holeName: string = match[1];
        // get the start and end location of the hole in the normalized response in the parsed node
        let _startLocation = toVSCodePosition(
            node?.startPosition || { row: 0, column: 0 }
        );
        let _endLocation = toVSCodePosition(
            node?.endPosition || { row: 0, column: 0 }
        );
        for (let child of children || []) {
            if (
                child.text === holeName ||
                child.text === holeName.slice(0, holeName.indexOf('('))
            ) {
                _startLocation = toVSCodePosition(child.startPosition);
                _endLocation = toVSCodePosition(child.endPosition);
            }
        }
        templateHoles[holeName] = {
            name: holeName,
            inferredType: 'string',
            rawText: match[0],
            // get the start and end location of the hole in the normalized response in the parsed node
            startLocation: _startLocation,
            endLocation: _endLocation,
        };
    }

    return [normalizedResponse, templateHoles];
};

export function completeCanonizePromptWithTreeSitter(
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
                    return '{{' + identifier + '}}';
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
        return ['"' + childrenValues?.join('') + '"' || '', templateHoles];
    } catch (e) {
        console.log(e);
        return ['', {}];
    }
}

export function canonizePromptWithTreeSitter(
    sourceFile: string,
    node: Parser.SyntaxNode | null,
    // extensionUri: vscode.Uri
    parser: Parser
): [string, { [key: string]: PromptTemplateHole }] {
    try {
        let templateHoles: { [key: string]: PromptTemplateHole } = {};
        const sourceFileURI = vscode.Uri.file(sourceFile);
        const sourceFileContents = fs.readFileSync(
            sourceFileURI.fsPath,
            'utf8'
        );
        // console.log('File loaded');
        const tree = parser.parse(sourceFileContents.toString());
        // get the node's descendants recursively that are strings and identifiers
        if (node?.type === 'string') {
            return [node.text.slice(1, -1), {}];
        } else if (node?.type === 'identifier') {
            const identifier = node.text;
            const helper = new ASTHelper();
            const value = helper._getIdentifierValue(identifier, tree);
            if (value) {
                return [value, {}];
            } else {
                templateHoles[identifier] = {
                    name: identifier,
                    inferredType: 'string',
                    rawText: identifier.toString(),
                    startLocation: toVSCodePosition(node.startPosition),
                    endLocation: toVSCodePosition(node.endPosition),
                } as PromptTemplateHole;
                return ['"' + identifier + '"', templateHoles];
            }
        }
        const children = node?.descendantsOfType([
            'attribute',
            'string_content',
            'identifier',
        ]);
        // remove the identifier children that are contained in attributes
        const filteredChildren = children?.filter((child) => {
            if (child.type === 'identifier') {
                return !child.parent?.type.includes('attribute');
            }
            return true;
        });
        // get the text of the children
        const childrenValues = filteredChildren?.map((child) => {
            if (child.type === 'identifier' || child.type === 'attribute') {
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
                    return '"+' + identifier + '+"';
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
        return ['"' + childrenValues?.join('') + '"' || '', templateHoles];
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
        // // if the right side is a function call, find the value of the function call
        // if (right?.type === 'function_call') {
        //     return this._getFunctionCallValue(right, tree);
        // }
        // if the right side is a binary expression, find the value of the binary expression
        if (right?.type === 'binary_expression') {
            return this._getBinaryExpressionValue(right, tree);
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
        //IF not supported return undefined
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
}
