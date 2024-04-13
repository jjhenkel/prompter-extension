import * as assert from 'assert';
import { readFileSync } from 'fs';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import { findPrompts } from '../modules/prompt-finder';
import * as vscode from 'vscode';
import { Backend, setBackend } from '../modules/LLMUtils';
const extensionUri = vscode.Uri.parse(
    __dirname.split('\\').slice(0, -2).join('/')
);

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
