import { readFileSync } from 'fs';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { findPrompts } from '../modules/prompt-finder';
// exit the out folder
const extensionUri = __dirname.split('\\').slice(0, -2).join('/');
console.log(extensionUri);

suite('Finder Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Find nothing', async () => {
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: "print('Hello, World!')", path: 'test.py' },
        ]);
        assert.deepEqual(result, []);
    });

    test('Find OpenAI', async () => {
        // find current work directory
        // const currentDirectory: string = __dirname;
        // console.log(currentDirectory);

        const path = extensionUri + '/src/test/openai-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 3);
    });

    test('Find Anthropic', async () => {
        const path = extensionUri + '/src/test/anthropic-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 1);
    });

    test('Find Cohere', async () => {
        const path = extensionUri + '/src/test/cohere-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 7);
    });

    test('Find prompt based names', async () => {
        const path = extensionUri + '/src/test/name-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 4);
    });

    test('Find Template|Message classes', async () => {
        const path = extensionUri + '/src/test/classes-test.py';
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [
            { contents: contents, path: path },
        ]);
        assert.equal(result.length, 3);
    });
});
