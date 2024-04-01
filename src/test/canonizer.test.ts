// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

import * as assert from 'assert';
import * as vscode from 'vscode';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import * as myExtension from '../extension';
import { PromptMetadata, findPrompts } from '../modules/prompt-finder';
import { readFileSync } from 'fs';
import { canonizePromptWithTreeSitter } from '../modules/prompt-finder/canonization';
const extensionUri = vscode.Uri.parse(
    __dirname.split('\\').slice(0, -2).join('/')
);
const templateOutput =
    'The following is a conversation with an AI Customer Segment Recommender. \
The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit.  \
AI, please state a insightful observation about new product .';
const templateCanonizationOutput =
    'The following is a conversation with an AI Customer Segment Recommender. \
The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit.  \
AI, please state a insightful observation about {{prompt_product_desc}} .';

const installExtensionsNeeded = async () => {
    // test if all the extensions in packageJson are installed
    if (!vscode.extensions.getExtension('github.copilot')) {
        await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            'github.copilot-chat'
        );
    }

    if (!vscode.extensions.getExtension('github.copilot-chat')) {
        await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            'github.copilot-chat'
        );
    }
    // wait for one minute
    // await new Promise((resolve) => setTimeout(resolve, 60000));
};
setup(async () => {
    await installExtensionsNeeded();
});

suite('Canonization Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    // install github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // install github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');

    test('Simple AST Redirect Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Canonization Python Test Files/ast-test-simple-redirect.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]).then((results) => {
            let canonized = results[0].normalizedText;
            // compare equality while ignoring whitespace and newlines and backslashes
            assert.equal(
                canonized.replace(/\s/g, '').replace(/\\/g, ''),
                templateOutput.replace(/\s/g, '').replace(/\\/g, '')
            );
        });
    });
    test('Simple AST Addition Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Canonization Python Test Files/ast-test-simple-addition.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        let canonized = results[0].normalizedText;
        // compare equality while ignoring whitespace and newlines and backslashes
        assert.equal(
            canonized.replace(/\s/g, '').replace(/\\/g, ''),
            templateOutput.replace(/\s/g, '').replace(/\\/g, '')
        );
    });
    test('Simple AST F-string Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Canonization Python Test Files/ast-test-simple-f-string.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        let canonized = results[0].normalizedText;
        // compare equality while ignoring whitespace and newlines and backslashes
        assert.equal(
            canonized.replace(/\s/g, '').replace(/\\/g, ''),
            templateOutput.replace(/\s/g, '').replace(/\\/g, '')
        );
    });

    test('Simple AST Modulo-string Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Canonization Python Test Files/ast-test-simple-modulo.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        let canonized = results[0].normalizedText;
        // compare equality while ignoring whitespace and newlines and backslashes
        assert.equal(
            canonized.replace(/\s/g, '').replace(/\\/g, ''),
            templateOutput.replace(/\s/g, '').replace(/\\/g, '')
        );
    });

    test('Simple Canonization Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Canonization Python Test Files/ast-test-simple-addition-canonization.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        let canonized = results[0].normalizedText;
        // compare equality while ignoring whitespace and newlines and backslashes
        assert.equal(
            canonized.replace(/\s/g, '').replace(/\\/g, ''),
            templateCanonizationOutput.replace(/\s/g, '').replace(/\\/g, '')
        );
        assert.equal(Object.keys(results[0].templateValues).length, 1);
        assert.equal(
            results[0].templateValues['prompt_product_desc'].name,
            'prompt_product_desc'
        );
    });
});
