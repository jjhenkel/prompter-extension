import * as assert from 'assert';
import { readFileSync } from 'fs';
import {
    fixGenderBias,
    fixGenderBiasResult,
} from '../modules/bias-fix-modules/gender-bias-fix-module';
import { findPrompts } from '../modules/prompt-finder';
import * as vscode from 'vscode';
import { Backend, setBackend } from '../modules/LLMUtils';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
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

suite('Bias Fix Test Suite', () => {
    vscode.window.showInformationMessage('Starting bias tests.');
    // activate github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // activate github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');
    suite('Gender Bias Fix Test Suite', () => {
        test('Simple Clear Gender Bias Fix Test', async () => {
            const path = vscode.Uri.joinPath(
                extensionUri,
                'src/test/Bias Fix Samples/Gender Bias Fix Samples/gender-bias-fix-sample.py'
            ).fsPath;
            const text = readFileSync(path, 'utf8');
            const discoveredPrompts = await findPrompts(extensionUri, [
                { contents: text, path: path },
            ]);
            const JSONresult: JSONSchemaObject = await fixGenderBias(
                discoveredPrompts[0]
            );
            assert.ok(!JSONresult.error);
            const result = JSONresult as fixGenderBiasResult;
            assert.ok(result.prompts && result.prompts.length > 0);
            // pretty print the array of fixes
            console.log(JSON.stringify(result.prompts, null, 2));
        });
        test('Possible Gender Bias Fix Test', async () => {
            const path = vscode.Uri.joinPath(
                extensionUri,
                'src/test/Bias Fix Samples/Gender Bias Fix Samples/maybe-gender-bias-fix-sample.py'
            ).fsPath;
            const text = readFileSync(path, 'utf8');
            const discoveredPrompts = await findPrompts(extensionUri, [
                { contents: text, path: path },
            ]);
            const JSONresult: JSONSchemaObject = await fixGenderBias(
                discoveredPrompts[0]
            );
            assert.ok(!JSONresult.error);
            const result = JSONresult as fixGenderBiasResult;
            assert.ok(result.prompts && result.prompts.length > 0);
            // pretty print the array of fixes
            console.log(JSON.stringify(result.prompts, null, 2));
        });
    });
});
