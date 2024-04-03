// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

import * as assert from 'assert';
import * as vscode from 'vscode';
import { findPrompts } from '../modules/prompt-finder';
import { readFileSync } from 'fs';
import { patchHoles } from '../modules/prompt-finder/hole-patching';
const packageJson = require('../../package.json');

const extensionUri = vscode.Uri.parse(
    __dirname.split('\\').slice(0, -2).join('/')
);

suite('Hole Patching Test Suite', async () => {
    vscode.window.showInformationMessage('Start all tests.');
    // install github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // install github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');
    test('Simple One Variable Patching Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Template Patcher Test Samples/patcher-test-simple-value.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        await patchHoles(results[0]).then(() => {
            for (let key in results[0].templateValues) {
                // console.log(results[0].templateValues[key].defaultValue);
                assert.equal(
                    results[0].templateValues[key].defaultValue.length > 0,
                    true
                );
            }
        });
        for (let key in results[0].templateValues) {
            console.log(key);
            console.log(
                JSON.stringify(results[0].templateValues[key].defaultValue)
            );
        }
    });

    test('Simple Two Variable Patching Test', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Template Patcher Test Samples/patcher-test-simple-two-values.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        await fillHoles(results[0]).then(() => {
            for (let key in results[0].templateValues) {
                // console.log(results[0].templateValues[key].defaultValue);
                assert.equal(
                    results[0].templateValues[key].defaultValue.length > 0,
                    true
                );
            }
        });
        for (let key in results[0].templateValues) {
            console.log(key);
            console.log(
                JSON.stringify(results[0].templateValues[key].defaultValue)
            );
        }
    });

    test('One Variable Patching Test with Readme', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Template Patcher Test Samples/template patch with readme/patcher-test-simple-value-with-readme.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let results = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);
        await patchHoles(results[0]).then(() => {
            for (let key in results[0].templateValues) {
                // console.log(results[0].templateValues[key].defaultValue);
                assert.equal(
                    results[0].templateValues[key].defaultValue.length > 0,
                    true
                );
                assert.ok(
                    results[0].templateValues[key].defaultValue.includes(
                        'flower'
                    )
                );
            }
        });
        for (let key in results[0].templateValues) {
            console.log(key);
            console.log(
                JSON.stringify(results[0].templateValues[key].defaultValue)
            );
        }
    });
});
