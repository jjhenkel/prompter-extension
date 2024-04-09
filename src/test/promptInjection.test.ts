import * as assert from 'assert';
import * as vscode from 'vscode';
import checkVariableInjection from '../modules/injection-module/var-injection-module';
import { readFileSync } from 'fs';
import { findPrompts } from '../modules/prompt-finder';
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

suite('Prompt Injection Test Suite', () => {
    vscode.window.showInformationMessage('Starting prompt tests.');
    // install github copilot extension to vs code
    // vscode.extensions.getExtension("github.copilot")?.activate();
    // install github copilot chat extension to vs code
    // vscode.extensions.getExtension("github.copilot-chat")?.activate();
    // wait for the extension to activate
    // vscode.window.showInformationMessage('Waiting for extension to activate.');
    // const simple_vulnerable_prompt = `
    // "The following is a conversation with an AI Customer Segment Recommender. \
    // The AI is playful with words, insightful, witty, clever, has great emphathy, and believes that " + prompt_focus_segment +\
    // "would be highly satisfied when they buy the product"
    // `;

    test('Simple Variable Injection Test on Vulnerable Prompt', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Prompt Injection Test Samples/simple-vulnerable-prompt.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let foundPrompts = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);

        const result: any = await checkVariableInjection(foundPrompts[0]);
        console.log(result);
        assert.strictEqual(result.vulnerable, 'Yes');
        assert.strictEqual(
            result.poisoned_responses[0][0],
            'prompt_focus_segment'
        );
        // assert that we received at least one poisoned response example
        assert.strictEqual(result.poisoned_responses.length > 0, true);
    });

    test('Simple Variable Injection Test on Safe Prompt', async () => {
        const path = vscode.Uri.joinPath(
            extensionUri,
            'src/test/Prompt Injection Test Samples/simple-safe-prompt.py'
        ).fsPath;
        const contents = readFileSync(path, 'utf8');
        let foundPrompts = await findPrompts(extensionUri, [
            { contents: contents, path: path },
        ]);

        const result: any = await checkVariableInjection(foundPrompts[0]);
        console.log(result);
        assert.strictEqual(result.vulnerable, 'No');
    });
});
