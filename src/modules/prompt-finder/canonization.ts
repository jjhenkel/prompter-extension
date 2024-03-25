// define function that takes a prompt and returns a canonical form

import { PromptMetadata } from '.';
import Parser from 'web-tree-sitter';
import * as vscode from 'vscode';

export async function canonizePrompt(
    prompt: PromptMetadata,
    extensionUri: vscode.Uri
): Promise<void> {
    // parse source file to PythonAST
    await Parser.init();

    const pythonGrammarUri = vscode.Uri.joinPath(
        extensionUri,
        'src/modules/prompt-finder/parsers/tree-sitter-python.wasm'
    ).fsPath;
    // Load the python grammar
    const pythonGrammar = await Parser.Language.load(pythonGrammarUri);

    // Create a parser
    const parser = new Parser();
    parser.setLanguage(pythonGrammar);
    // Read the source file contents
    const sourceFileContents = await vscode.workspace.fs.readFile(
        vscode.Uri.file(prompt.sourceFilePath)
    );
    const tree = parser.parse(prompt.sourceFilePath);
    // Get the path to the python grammar (WASM file)
    console.log(tree.rootNode.toString());
}

// declare main function that takes a prompt and returns a canonical form

function main() {
    // load prompt from json file
    let prompt = JSON.parse(
        'C:\\Users\\v-drzig\\Desktop\\ExamplePrompt.json'
    ) as PromptMetadata;
    // call canonizePrompt
    canonizePrompt(prompt, vscode.Uri.parse(__dirname));
}
main();
