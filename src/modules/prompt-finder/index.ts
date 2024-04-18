import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import hash from 'object-hash';
import { canonizeWithTreeSitterANDCopilotGPT } from './canonization';
// import { patchValue } from './holePatching';

// This type represents a hole in a prompt template.
// Ex: "Hello, my name is {name}" would have a hole named "name"
export type PromptTemplateHole = {
    name: string;
    inferredType: string;
    rawText: string;
    startLocation: vscode.Position;
    endLocation: vscode.Position;
    defaultValue?: any;
};

// This type represents a parameter associated with a prompt
export type PromptParameter = {
    name: string;
    rawText: string;
    startLocation: vscode.Position;
    endLocation: vscode.Position;
};

// This type represents a prompt and its metadata. It includes
// the text of the prompt, the start and end locations of the prompt
// in the file, and a map storing the template values in the prompt.
// (we call these PromptTemplateHoles or "holes" for short)
export type PromptMetadata = {
    id: string;
    rawText: string;
    rawTextOfParentCall: string;
    normalizedText: string;
    startLocation: vscode.Position;
    endLocation: vscode.Position;
    parentCallStartLocation: vscode.Position;
    parentCallEndLocation: vscode.Position;
    templateValues: {
        [key: string]: PromptTemplateHole;
    };
    // This is for things like temperature, max_tokens, etc.
    associatedParameters: {
        [key: string]: PromptParameter;
    };
    sourceFilePath: string;
    // promptNode?: Parser.SyntaxNode;
    isSystemPrompt?: boolean;
    associatedSystemPrompts?: [PromptMetadata];
    selectedSystemPromptText?: string;
};

// This module defines a function, findPrompts, that takes

// a tree sitter tree and users a cursor to walk the tree
// and find prompts.

let parserG: Parser | null = null;

export const findPrompts = async (
    extensionUri: vscode.Uri,
    filesToScan: Array<{ contents: string; path: string }>
) => {
    // Init parser
    await Parser.init();

    // Get the path to the python grammar (WASM file)
    const pythonGrammarUri = vscode.Uri.joinPath(
        extensionUri,
        'src/modules/prompt-finder/parsers/tree-sitter-python.wasm'
    ).fsPath;

    // Load the python grammar
    const pythonGrammar = await Parser.Language.load(pythonGrammarUri);

    // Create a parser
    const parser = new Parser();
    parser.setLanguage(pythonGrammar);
    parserG = parser;

    // Try and parse, then walk the tree and return results
    const promptMatches = await Promise.all(
        filesToScan.map(async (file) => {
            try {
                // Parse / walk / return results from cursor
                const tree = parser.parse(file.contents);
                let results: PromptMetadata[] = [];

                // results = results.concat(
                //     await _findOpenAICompletionCreate(
                //         file.path,
                //         tree,
                //         pythonGrammar
                //     )
                // );
                results = results.concat(
                    await _findOpenAIChatCalls(file.path, tree, pythonGrammar)
                );
                results = results.concat(
                    await _findAnthropicChatCalls(
                        file.path,
                        tree,
                        pythonGrammar
                    )
                );
                results = results.concat(
                    await _findCohereChatCalls(file.path, tree, pythonGrammar)
                );
                results = results.concat(
                    await _findPromptInName(file.path, tree, pythonGrammar)
                );
                results = results.concat(
                    await _findTemplateClass(file.path, tree, pythonGrammar)
                );
                results = results.concat(
                    await _findMessageDictionary(file.path, tree, pythonGrammar)
                );

                // find all the prompts that are system prompts
                // and associate them with the prompts that are not system prompts
                const systemPrompts = results.filter(
                    (prompt) => prompt.isSystemPrompt
                );
                const nonSystemPrompts = results.filter(
                    (prompt) => !prompt.isSystemPrompt
                );
                for (const nonSystemPrompt of nonSystemPrompts) {
                    for (const systemPrompt of systemPrompts) {
                        if (
                            nonSystemPrompt.associatedSystemPrompts ===
                            undefined
                        ) {
                            nonSystemPrompt.associatedSystemPrompts = [
                                systemPrompt,
                            ];
                        } else {
                            nonSystemPrompt.associatedSystemPrompts.push(
                                systemPrompt
                            );
                        }
                    }
                    if (
                        nonSystemPrompt.associatedSystemPrompts !== undefined &&
                        nonSystemPrompt.associatedSystemPrompts.length > 0
                    ) {
                        nonSystemPrompt.selectedSystemPromptText =
                            nonSystemPrompt.selectedSystemPromptText =
                                nonSystemPrompt.associatedSystemPrompts[0].normalizedText;
                    }
                }

                return results;
            } catch (e) {
                console.warn(`Error parsing file ${file.path}: ${e}`);
                return [];
            }
        })
    );

    // Flatten the results
    return promptMatches.flat();
};

const _getOpenAIPromptMetadataQuery = (
    language: Parser.Language,
    argument: string
) => {
    return language.query(
        `(call
      function: (_)
      arguments: (argument_list
        (keyword_argument
          name: (identifier) @arg.name
          (#eq? @arg.name "${argument}")
          value: (_) @arg.value
        )
      )
    )`
    );
};

export const toVSCodePosition = (position: Parser.Point) =>
    new vscode.Position(position.row, position.column);

const _findOpenAICompletionCreate = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(call 
        function: (attribute object: (_) attribute: (_)) @call.name 
          (#eq? @call.name "openai.Completion.create")
        arguments: (argument_list (
          (keyword_argument 
            name: (identifier) @prompt.name 
            (#eq? @prompt.name "prompt") 
            value: (_) @prompt.value
          )
        )
      )
    ) @call.everything`
    );

    const captures = query.captures(tree.rootNode);
    const results = [];

    // First, we need to find all of the `call.everything` captures
    // and give them a unique ID so we can then associate any capture
    // that is _contained_ within them
    const callEverythingCaptures = captures.filter(
        (capture) => capture.name === 'call.everything'
    );

    // Utility funcs

    const greatGreatGrandparentEquals = (
        node: Parser.SyntaxNode,
        other: Parser.SyntaxNode
    ) => {
        return node.parent?.parent?.parent?.equals(other);
    };

    // Now, for each `call.everything` capture, we will look at nested props
    for (let callEverythingCapture of callEverythingCaptures) {
        // Let's grab the matching prompt argument
        const promptArgument = captures.find((capture) => {
            // Want the prompt's value
            return (
                capture.name === 'prompt.value' &&
                // Parent is keyword_argument
                // Parent's parent is argument_list
                // Parent's parent's parent is call node
                greatGreatGrandparentEquals(
                    capture.node,
                    callEverythingCapture.node
                )
            );
        });

        // If we didn't find a prompt argument, skip this capture
        if (!promptArgument) {
            continue;
        }

        const promptMeta = await _createPromptMetadata(
            sourceFilePath,
            callEverythingCapture,
            promptArgument.node
        );

        // Now let's try and find any associated parameters
        const possibleArguments = [
            'temperature',
            'max_tokens',
            'top_p',
            'frequency_penalty',
            'presence_penalty',
            'stop',
            'n',
            'logprobs',
            'echo',
            'best_of',
            'logit_bias',
            'stream',
        ];

        // For each possible argument, we will try and find it in the tree
        promptMeta.associatedParameters = possibleArguments.reduce(
            (acc, argument) => {
                // Build the query
                const argumentQuery = _getOpenAIPromptMetadataQuery(
                    language,
                    argument
                );

                // Run it on this subtree
                const argValue = argumentQuery
                    .captures(callEverythingCapture.node)
                    .find((capture) => capture.name === 'arg.value');

                // If we found a match, add it to the accumulator
                if (argValue) {
                    acc[argument] = {
                        name: argument,
                        rawText: argValue.node.text,
                        startLocation: toVSCodePosition(
                            argValue.node.startPosition
                        ),
                        endLocation: toVSCodePosition(
                            argValue.node.endPosition
                        ),
                    } as PromptParameter;
                }

                // Return the accumulator
                return acc;
            },
            {} as { [key: string]: PromptParameter }
        );

        // Add to results
        results.push(promptMeta);
    }

    return results;
};

const _findAnthropicChatCalls = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(call 
      function: (attribute) @fn.name
      (#match? @fn.name "\\.messages\\.create")
      arguments: (argument_list
        (keyword_argument
          name: (identifier) @prompt.name
          (#match? @prompt.name "^messages$")
          value: (_) @prompt.value
        ) @prompt
      )
    ) @call.everything
  `.trim()
    );

    const isPrompt = (node: Parser.SyntaxNode) =>
        node.type === 'keyword_argument' && 'messages' === node.child(0)?.text;

    return (
        await Promise.all(
            query
                .captures(tree.rootNode)
                .filter((capture) => capture.name === 'call.everything')
                .map((capture) => {
                    // Find the first positional argument, or the argument with key prompt/message/text
                    // Let's grab the matching prompt argument
                    let argument_list = capture.node.lastChild;
                    let prompt = argument_list?.children
                        .find(isPrompt)
                        ?.child(2);

                    return prompt
                        ? _createPromptMetadata(sourceFilePath, capture, prompt)
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as unknown as PromptMetadata[];
};

const _findOpenAIChatCalls = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(call 
      function: (attribute) @fn.name
      (#match? @fn.name "(\\.[Cc]hat)?\\.?[Cc]ompletions?\\.create")
      arguments: (argument_list
        (keyword_argument
          name: (identifier) @prompt.name
          (#match? @prompt.name "^(prompt|messages)$")
          value: (_) @prompt.value
        ) @prompt
      )
    ) @call.everything
  `.trim()
    );

    const isPrompt = (node: Parser.SyntaxNode) =>
        node.type === 'keyword_argument' &&
        ['prompt', 'messages'].includes(node.child(0)?.text ?? '');

    return (
        await Promise.all(
            query
                .captures(tree.rootNode)
                .filter((capture) => capture.name === 'call.everything')
                .map((capture) => {
                    // Find the first positional argument, or the argument with key prompt/message/text
                    // Let's grab the matching prompt argument
                    let argument_list = capture.node.lastChild;
                    let prompt = argument_list?.children.find(isPrompt);

                    if (prompt && prompt.type === 'keyword_argument') {
                        prompt = prompt.child(2) ?? prompt;
                    }

                    return prompt
                        ? _createPromptMetadata(sourceFilePath, capture, prompt)
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as unknown as PromptMetadata[];
};

const _findCohereChatCalls = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(call 
      function: 
        (attribute object: (identifier) attribute: (identifier) @call.name)
        (#match? @call.name "^(chat|summarize|generate)$")
      arguments: (argument_list)
    ) @call.everything
  `.trim()
    );

    const isPrompt = (node: Parser.SyntaxNode) =>
        ['prompt', 'message', 'text'].includes(node.child(0)?.text ?? '');
    const isKeyword = (node: Parser.SyntaxNode) =>
        node.type === 'keyword_argument' && isPrompt(node);
    const isPositional = (node: Parser.SyntaxNode) =>
        node.type === 'string' || node.type === 'identifier';

    return (
        await Promise.all(
            query
                .captures(tree.rootNode)
                .filter((capture) => capture.name === 'call.everything')
                .map((capture) => {
                    // Find the first positional argument, or the argument with key prompt/message/text
                    // Let's grab the matching prompt argument
                    let argument_list = capture.node.lastChild;
                    let prompt = argument_list?.children.find(
                        (node) => isPositional(node) || isKeyword(node)
                    );

                    if (prompt && prompt.type === 'keyword_argument') {
                        prompt = prompt.child(2) ?? prompt;
                    }

                    // Add to results
                    return prompt
                        ? _createPromptMetadata(sourceFilePath, capture, prompt)
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as unknown as PromptMetadata[];
};

const _findPromptInName = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(expression_statement
      (assignment
          left: (identifier) @var.name
          right: (_)
      )
      (#match? @var.name "([Pp][Rr][Oo][Mm][Pp][Tt]|[Tt][Ee][Mm][Pp][Ll][Aa][Tt][Ee])")
  ) @everything
  `.trim()
    );

    const augmented_query = language.query(
        `(expression_statement
      (augmented_assignment
          left: (identifier) @var.name
          right: (_)
      )
      (#match? @var.name "([Pp][Rr][Oo][Mm][Pp][Tt]|[Tt][Ee][Mm][Pp][Ll][Aa][Tt][Ee])")
  ) @everything
  `.trim()
    );

    return (
        await Promise.all(
            query
                .captures(tree.rootNode)
                .concat(augmented_query.captures(tree.rootNode))
                .filter((capture) => capture.name === 'everything')
                .map((capture) => {
                    // The 0th child is the assignment, then {0: name, 1: operator, 2: value}
                    const prompt = capture.node
                        .child(0)
                        ?.childForFieldName('right');

                    // If we didn't find a prompt argument, skip this capture
                    return prompt
                        ? _createPromptMetadata(sourceFilePath, capture, prompt)
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as unknown as PromptMetadata[];
};

const _findTemplateClass = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const from_query = language.query(
        `(call 
      function: 
        (attribute object: (identifier) @obj attribute: (identifier))
        (#match? @obj "Template$")
      arguments: (argument_list (_)* @arg)
    ) @everything`
    );

    const template_query = language.query(
        `(call 
      function: (identifier) @obj (#match? @obj "(Template|Message)$")
      arguments: (argument_list (_)* @arg)
    ) @everything`
    );

    return (
        await Promise.all(
            from_query
                .captures(tree.rootNode)
                .concat(template_query.captures(tree.rootNode))
                .filter((capture) => capture.name === 'everything')
                .map((capture) => {
                    const prompt = capture.node
                        .childForFieldName('arguments')
                        ?.child(0);

                    // If we didn't find a prompt argument, skip this capture
                    return prompt
                        ? _createPromptMetadata(sourceFilePath, capture, prompt)
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as unknown as PromptMetadata[];
};

const _findMessageDictionary = async (
    sourceFilePath: string,
    tree: Parser.Tree,
    language: Parser.Language
) => {
    const query = language.query(
        `(dictionary
      (pair
        key: (string) @key
        value: (_) @value
      )(#match? @key "content|message")
    ) @everything`
    );

    return (
        await Promise.all(
            query
                .captures(tree.rootNode)
                .filter((capture) => capture.name === 'everything')
                .map((capture) => {
                    const prompt = query
                        .captures(capture.node)
                        .filter((capture) => capture.name === 'value')
                        .pop();

                    // If we didn't find a prompt argument, skip this capture
                    return prompt
                        ? _createPromptMetadata(
                              sourceFilePath,
                              capture,
                              prompt.node
                          )
                        : undefined;
                })
        )
    ).filter((x) => x !== undefined) as PromptMetadata[];
};

const _createPromptMetadata = async (
    filepath: string,
    everything: Parser.QueryCapture,
    promptNode: Parser.SyntaxNode
) => {
    const promptMeta = {
        sourceFilePath: filepath,
        // This is a unique ID for this prompt
        // (based on its location in the file, file it is in, and text of the call node)
        id: hash({
            filepath,
            start: everything.node.startIndex,
            end: everything.node.endIndex,
            text: everything.node.text,
        }),
    } as PromptMetadata;

    // Grab some meta on the parent call
    promptMeta.rawTextOfParentCall = everything.node.text;

    //extract the role
    if (promptMeta.rawTextOfParentCall.includes('"role":')) {
        let role: String = promptMeta.rawTextOfParentCall
            .split('"role":')[1]
            ?.split('"')[1];
        if (role.toLowerCase() === 'system') {
            promptMeta.isSystemPrompt = true;
        }
    } else if (promptMeta.rawTextOfParentCall.includes("'role':")) {
        let role: String = promptMeta.rawTextOfParentCall
            .split("'role':")[1]
            ?.split("'")[1];
        if (role.toLowerCase() === 'system') {
            promptMeta.isSystemPrompt = true;
        }
    } else if (promptMeta.rawTextOfParentCall.includes('=')) {
        let variable_name = promptMeta.rawTextOfParentCall.split('=')[0].trim();
        if (variable_name.toLowerCase().includes('system')) {
            promptMeta.isSystemPrompt = true;
        }
    }

    promptMeta.parentCallStartLocation = toVSCodePosition(
        everything.node.startPosition
    );
    promptMeta.parentCallEndLocation = toVSCodePosition(
        everything.node.endPosition
    );

    // Grab some meta on the prompt
    promptMeta.rawText = promptNode.text;
    promptMeta.startLocation = toVSCodePosition(promptNode.startPosition);
    promptMeta.endLocation = toVSCodePosition(promptNode.endPosition);

    // Off by one error in the end location, so we'll fix it
    promptMeta.endLocation = new vscode.Position(
        promptMeta.endLocation.line + 1,
        promptMeta.endLocation.character
    );

    // The template holes and normalized text will be dealt with later
    try {
        [promptMeta.normalizedText, promptMeta.templateValues] =
            // await canonizeWithCopilotGPT(promptMeta.sourceFilePath, promptNode);
            // await canonizeWithCopilotGPT(promptMeta.sourceFilePath, promptNode);
            await canonizeWithTreeSitterANDCopilotGPT(
                promptMeta.sourceFilePath,
                promptNode,
                parserG!
            );
    } catch (e) {
        console.error(e);
    }
    return promptMeta;
};
