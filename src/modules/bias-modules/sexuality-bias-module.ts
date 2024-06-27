import { ChatCompletionMessageParam } from 'openai/resources';
import * as utils from '../LLMUtils.js';
import * as PromptUtils from '../PromptUtils.js';
import { PromptMetadata } from '../prompt-finder/index.js';
import { patchHoles } from '../prompt-finder/hole-patching.js';
import path from 'path';

export type SexualityBiasResult = {
    error?: string;
    sexuality_biased?: boolean;
    may_cause_sexuality_bias?: boolean;
    reasoning?: string;
};

async function checkSexualityBias(
    inputPrompt: PromptMetadata,
    useSystemPrompt: boolean = true
): Promise<SexualityBiasResult> {
    // load prompt from yaml file
    let serializedPrompts = PromptUtils.loadPromptsFromYaml(
        path.resolve(__dirname, 'sexuality_prompt.yaml')
    );

    let userPromptObject = PromptUtils.getPromptsOfRole(
        serializedPrompts,
        'user'
    )[0];
    const systemPromptText = PromptUtils.getPromptsOfRole(
        serializedPrompts,
        'system'
    )[0].content;

    var userPromptText: string = userPromptObject.content;

    // inject text variables into prompt
    const variables_to_inject = userPromptObject.injectedVariables;
    if (variables_to_inject === undefined || variables_to_inject.length < 1) {
        console.error('Insufficient variables to inject in the prompt');
        return { error: 'Insufficient variables to inject in the prompt' };
    }
    userPromptText = userPromptText.replaceAll('__', '\n');
    let patchedPrompt = inputPrompt.normalizedText;
    // if the prompt has undefined template values, perform hole patching
    await patchHoles(inputPrompt);
    for (const key in inputPrompt.templateValues) {
        let value = inputPrompt.templateValues[key].defaultValue;
        patchedPrompt = patchedPrompt.replaceAll('{{' + key + '}}', value);
    }

    let userPrompt = userPromptText;
    // for (const variable in variables_to_inject) {
    let value = '{{' + variables_to_inject[0] + '}}'; // prompt_text
    userPrompt = userPrompt.replaceAll(value, patchedPrompt);
    value = '{{' + variables_to_inject[1] + '}}'; // system_prompt
    if (
        useSystemPrompt === true &&
        inputPrompt.selectedSystemPromptText !== undefined &&
        inputPrompt.selectedSystemPromptText !== ''
    ) {
        userPrompt = userPrompt.replaceAll(
            value,
            'To enhance your analysis, use the following system prompt for context:' +
                inputPrompt.selectedSystemPromptText
        );
    } else {
        userPrompt = userPrompt.replaceAll(value, '');
    }
    // send the prompt to azure openai using client
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPromptText },
        { role: 'user', content: userPrompt },
    ];

    // console.log(messages);
    // convert messages list to chat request
    let client = utils.getClient();
    // console.log(client);
    if (client === undefined) {
        console.error('Client is undefined');
        return { error: 'Issue during OpenAI configuration' };
    } else {
        const result = await utils.sendChatRequest(
            messages,
            {
                model: utils.GPTModel.GPT3_5Turbo,
                temperature: 0.3,
                seed: 42,
            },
            undefined,
            true,
            true
        );
        // const response = await client.chat.completions.create({
        //     messages: messages,
        //     model: deploymentId,
        //     temperature: 0.3,
        //     seed: 42,
        // });
        // const result = response.choices?.[0]?.message?.content;
        // console.log(result);
        // convert result to json and return
        if (result !== undefined && result !== null) {
            const result_json = JSON.parse(result);
            return result_json;
        } else {
            return { error: 'No response from Azure OpenAI' };
        }
    }
}

export default checkSexualityBias;
