import * as vscode from 'vscode';
import Parser from 'web-tree-sitter';
import hash from 'object-hash';

// This type represents a hole in a prompt template.
// Ex: "Hello, my name is {name}" would have a hole named "name"
export type PromptTemplateHole = {
    name: string;
    inferredType: string;
    rawText: string;
    startLocation: vscode.Position;
    endLocation: vscode.Position;
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
};

// This module defines a function, findPrompts, that takes
// a tree sitter tree and users a cursor to walk the tree
// and find prompts.
export const findPrompts = async (extensionUri: vscode.Uri, filesToScan: Array<{ contents: string; path: string }>) => {
    // Init parser
    await Parser.init();

    // Get the path to the python grammar (WASM file)
    const pythonGrammarUri = vscode.Uri.joinPath(
        extensionUri, 'src/modules/prompt-finder/parsers/tree-sitter-python.wasm'
    ).fsPath;

    // Load the python grammar
    const pythonGrammar = await Parser.Language.load(pythonGrammarUri);

    // Create a parser
    const parser = new Parser();
    parser.setLanguage(pythonGrammar);

    // Try and parse, then walk the tree and return results
    const promptMatches = await Promise.all(
        filesToScan.map(async (file) => {
            try {
                // Parse / walk / return results from cursor
                const tree = parser.parse(file.contents);
                return await _findOpenAICompletionCreate(file.path, tree, pythonGrammar);
            } catch (e) {
                console.warn(`Error parsing file ${file.path}: ${e}`);
                return [];
            }
        })
    );

    // Flatten the results
    return promptMatches.flat();
};

const _getOpenAIPromptMetadataQuery = (language: Parser.Language, argument: string) => {
    return language.query(`
        (call
            function: (_)
            arguments: (argument_list
                (keyword_argument
                    name: (identifier) @arg.name
                        (#eq? @arg.name "${argument}")
                    value: (_) @arg.value
                )
            )
        )
    `.trim());
};

const _findOpenAICompletionCreate = async (sourceFilePath: string, tree: Parser.Tree, language: Parser.Language) => {
    const query = language.query(`
        (call 
            function: (attribute object: (_) attribute: (_)) @call.name 
                (#eq? @call.name "openai.Completion.create")
            arguments: (argument_list (
                (keyword_argument 
                    name: (identifier) @prompt.name 
                        (#eq? @prompt.name "prompt") 
                    value: (_) @prompt.value
                )
            ))
        ) @call.everything
    `.trim());

    const captures = query.captures(tree.rootNode);
    const results = [];

    // First, we need to find all of the `call.everything` captures
    // and give them a unique ID so we can then associate any capture
    // that is _contained_ within them
    const callEverythingCaptures = captures.filter((capture) => capture.name === 'call.everything');

    // Utility funcs
    const toVSCodePosition = (position: Parser.Point) => new vscode.Position(position.row, position.column);
    const greatGreatGrandparentEquals = (node: Parser.SyntaxNode, other: Parser.SyntaxNode) => {
        return node.parent?.parent?.parent?.equals(other);
    };

    // Now, for each `call.everything` capture, we will look at nested props
    for (let i = 0; i < callEverythingCaptures.length; i++) {
        const callEverythingCapture = callEverythingCaptures[i];

        const promptMeta = {
            sourceFilePath,
            // This is a unique ID for this prompt 
            // (based on its location in the file, file it is in, and text of the call node)
            id: hash({
                sourceFilePath,
                start: callEverythingCapture.node.startIndex,
                end: callEverythingCapture.node.endIndex,
                text: callEverythingCapture.node.text,
            }),
        } as PromptMetadata;

        // Grab some meta on the parent call
        promptMeta.rawTextOfParentCall = callEverythingCapture.node.text;
        promptMeta.parentCallStartLocation = toVSCodePosition(callEverythingCapture.node.startPosition);
        promptMeta.parentCallEndLocation = toVSCodePosition(callEverythingCapture.node.endPosition);

        // Let's grab the matching prompt argument
        const promptArgument = captures.find((capture) => {
            // Want the prompt's value
            return capture.name === 'prompt.value' && 
                // Parent is keyword_argument
                // Parent's parent is argument_list
                // Parent's parent's parent is call node
                greatGreatGrandparentEquals(capture.node, callEverythingCapture.node);
        });

        // If we didn't find a prompt argument, skip this capture
        if (!promptArgument) {
            continue;
        }

        // Grab some meta on the prompt
        promptMeta.rawText = promptArgument.node.text;
        promptMeta.startLocation = toVSCodePosition(promptArgument.node.startPosition);
        promptMeta.endLocation = toVSCodePosition(promptArgument.node.endPosition);

        // Off by one error in the end location, so we'll fix it
        promptMeta.endLocation = new vscode.Position(promptMeta.endLocation.line + 1, promptMeta.endLocation.character);

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
        promptMeta.associatedParameters = possibleArguments.reduce((acc, argument) => {
            // Build the query
            const argumentQuery = _getOpenAIPromptMetadataQuery(language, argument);
            
            // Run it on this subtree
            const argValue = argumentQuery.captures(callEverythingCapture.node).find(
                (capture) => capture.name === 'arg.value'
            );

            // If we found a match, add it to the accumulator
            if (argValue) {
                acc[argument] = {
                    name: argument,
                    rawText: argValue.node.text,
                    startLocation: toVSCodePosition(argValue.node.startPosition),
                    endLocation: toVSCodePosition(argValue.node.endPosition),
                } as PromptParameter;
            }
            
            // Return the accumulator
            return acc;
        }, {} as { [key: string]: PromptParameter });

        // The template holes and normalized text will be dealt with later
        promptMeta.templateValues = {};
        promptMeta.normalizedText = '';

        // Add to results
        results.push(promptMeta);
    }

    return results;
};
