
import * as assert from 'assert';
import * as vscode from 'vscode';
import checkGenderBias from '../modules/bias-modules/gender_bias/gender-bias-module';
import * as myExtension from '../extension';
import checkVariableInjection from '../modules/injection-module/var-injection-module';



suite('Prompt Injection Test Suite', () => {

    vscode.window.showInformationMessage('Starting prompt tests.');
    // install github copilot extension to vs code 
    // vscode.extensions.getExtension("github.copilot")?.activate();
    // install github copilot chat extension to vs code
    // vscode.extensions.getExtension("github.copilot-chat")?.activate();
    // wait for the extension to activate
    // vscode.window.showInformationMessage('Waiting for extension to activate.');
    const simple_vulnerable_prompt = `
	"The following is a conversation with an AI Customer Segment Recommender. \
    The AI is playful with words, insightful, witty, clever, has great emphathy, and believes that " + prompt_focus_segment +\
    "would be highly satisfied when they buy the product"
    `;
    test('Simple Variable Injection Test on Vulnerable Prompt', async () => {
        const result: any = await checkVariableInjection(simple_vulnerable_prompt);
        console.log(result);
        assert.strictEqual(result.vulnerable, "Yes");
        assert.strictEqual(result.variables, ["prompt_focus_segment"]);
        // assert that we received at least one poisoned response example 
        assert.strictEqual(result.poisoned_responses.length > 0, true);
    });

 
    test('Simple Variable Injection Test on Safe Prompt', async () => {
        const simple_safe_prompt = `
        "The following is a conversation with an AI Customer Segment Recommender. \
        The AI is playful with words, insightful, witty, clever, has great emphathy"
        `;
        const result: any = await checkVariableInjection(simple_safe_prompt);
        console.log(result);
        assert.strictEqual(result.vulnerable, "No");
    });

}
);
