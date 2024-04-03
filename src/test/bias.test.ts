import * as assert from 'assert';
import { readFileSync } from 'fs';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import { findPrompts } from '../modules/prompt-finder';
import * as vscode from 'vscode';
const extensionUri = vscode.Uri.parse(
    __dirname.split('\\').slice(0, -2).join('/')
);
suite('Bias Test Suite', () => {
    vscode.window.showInformationMessage('Starting bias tests.');
    // activate github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // activate github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');
    suite('Gender Bias Test Suite', () => {
        test('Simple Clear Gender Bias Test', async () => {
            const path = vscode.Uri.joinPath(
                extensionUri,
                'src/test/Bias Test Samples/Gender Bias Test Samples/simple-test-is-biased.py'
            ).fsPath;
            const text = readFileSync(path, 'utf8');
            const discoveredPrompts = await findPrompts(extensionUri, [
                { contents: text, path: path },
            ]);
            const result: any = await checkGenderBias(discoveredPrompts[0]);
            // console.log(result);
            assert.strictEqual(result.may_cause_gender_bias, true);
            assert.strictEqual(result.gender_bias, true);
        });

        test('Simple Possible Gender Bias Test', async () => {
            const path = vscode.Uri.joinPath(
                extensionUri,
                'src/test/Bias Test Samples/Gender Bias Test Samples/simple-test-maybe-biased.py'
            ).fsPath;
            const text = readFileSync(path, 'utf8');
            const discoveredPrompts = await findPrompts(extensionUri, [
                { contents: text, path: path },
            ]);
            const result: any = await checkGenderBias(discoveredPrompts[0]);
            // console.log(result);
            assert.strictEqual(result.may_cause_gender_bias, true);
            assert.strictEqual(result.gender_bias, false);
        });
        test('Simple Gender Bias Test with Hole Patching', async () => {
            const path = vscode.Uri.joinPath(
                extensionUri,
                'src/test/Bias Test Samples/Gender Bias Test Samples/simple-test-biased-with-patching.py'
            ).fsPath;
            const text = readFileSync(path, 'utf8');
            const discoveredPrompts = await findPrompts(extensionUri, [
                { contents: text, path: path },
            ]);
            const result: any = await checkGenderBias(discoveredPrompts[0]);
            // console.log(result);
            assert.strictEqual(result.may_cause_gender_bias, true);
            assert.strictEqual(result.gender_bias, true);
        });
    });
});
