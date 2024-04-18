import { readFileSync } from 'fs';
import * as assert from 'assert';
import * as vscode from 'vscode';

// const packageJson = require('../../package.json');
// const tokenJson = require('../../token.json');
import { findPrompts } from '../modules/prompt-finder';
import { Backend, setBackend } from '../modules/LLMUtils';
// exit the out folder
const extensionUri = __dirname.split('\\').slice(0, -2).join('/');
console.log(extensionUri);

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
    setBackend(Backend.Azure); // set the backend to Azure or Copilot. NOTE: Copilot Backend Testing only works in debug mode for now.
});
suite('Finder Test Suite', () => {
    vscode.window.showInformationMessage('Waiting for extension to activate.');
    // setup(() => {
    // installExtensionsNeeded();
    // });
    test('Find nothing', async () => {
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: "print('Hello, World!')", path: 'test.py' },
        ]);
        assert.deepEqual(result, []);
    });

    test('Find OpenAI', async () => {
        const path =
            extensionUri +
            '/src/test/Prompt Finder Test Samples/openai-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 3);
    });

    test('Find Anthropic', async () => {
        const path =
            extensionUri +
            '/src/test/Prompt Finder Test Samples/anthropic-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 1);
    });

    test('Find Cohere', async () => {
        const path =
            extensionUri +
            '/src/test/Prompt Finder Test Samples/cohere-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 7);
    });

    test('Find prompt based names', async () => {
        const path =
            extensionUri + '/src/test/Prompt Finder Test Samples/name-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 4);
    });

    test('Find Template|Message classes', async () => {
        const path =
            extensionUri +
            '/src/test/Prompt Finder Test Samples/classes-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 3);
    });

    test('Find System Prompts', async () => {
        const path =
            extensionUri +
            '/src/test/Prompt Finder Test Samples/system-prompts.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.ok(result.length >= 2);
        for (const prompt of result) {
            assert.equal(prompt.isSystemPrompt, true);
        }
    });
});
