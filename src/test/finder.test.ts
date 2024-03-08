import {readFileSync} from 'fs';
import * as assert from 'assert';
import * as vscode from 'vscode';

import {findPrompts} from "../modules/prompt-finder";

suite('Finder Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    const extensionUri = "/Users/kaiser/home/work/prompter-extension";

    test('Find nothing', async () => {
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: "print('Hello, World!')", path: "test.py"}]);
        assert.deepEqual(result, []);
    });

    test('Find OpenAI', async () => {
        const path = extensionUri + "/src/test/openai-test.py";
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: contents, path: path}]);
        assert.equal(result.length, 2);
    });

    test('Find Anthropic', async () => {
        const path = extensionUri + "/src/test/anthropic-test.py";
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: contents, path: path}]);
        assert.equal(result.length, 1);
    });

    test('Find Cohere', async () => {
        const path = extensionUri + "/src/test/cohere-test.py";
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: contents, path: path}]);
        assert.equal(result.length, 5);
    });

    test('Find prompt based names', async () => {
        const path = extensionUri + "/src/test/name-test.py";
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: contents, path: path}]);
        assert.equal(result.length, 4);
    });

    test('Find Template|Message classes', async () => {
        const path = extensionUri + "/src/test/classes-test.py";
        const contents = readFileSync(path, 'utf8');
        const result = await findPrompts(vscode.Uri.parse(extensionUri), [{contents: contents, path: path}]);
        assert.equal(result.length, 3);
    });
});