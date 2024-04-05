// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

import * as assert from 'assert';
import * as vscode from 'vscode';
const extensionUri = __dirname.split('\\').slice(0, -2).join('/');
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    // install github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // install github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');

    test('Sample test', () => {
        // console.log("Sample test");
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });
});
