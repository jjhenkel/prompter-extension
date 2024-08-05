import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
import { PromptMetadata } from '../prompt-finder';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import * as LLMUtils from '../LLMUtils';
import { Position } from 'vscode';
import checkVariableInjection, {
    VariableInjectionResult,
} from '../injection-module/var-injection-module';
export type promptRole = 'user' | 'system' | 'assistant';

export type serializedPrompt = {
    role: promptRole;
    content: string;
    injectedVariables?: Array<string>;
};

export type fixInjectionResult = {
    error?: string;
    prompts?: Array<string>;
    // unresolvedKeys?: Array<string[]>;
};

export async function fixVulnerabilityInjection(
    inputPrompt: PromptMetadata
): Promise<fixInjectionResult> {
    // inputPrompt: PromptMetadata
    // extract the prompt from the yaml file
    let biasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'injection_fix_prompt_1.yaml'),
            'utf8'
        )
    ) as Array<serializedPrompt>;
    // extract the user prompt from the yaml file
    let injectionFixSystemPrompt = biasFixPromptYaml.find(
        (prompt) => prompt.role === 'system'
    );
    let injectionFixUserPrompt = biasFixPromptYaml.find(
        (prompt) => prompt.role === 'user'
    );
    if (!injectionFixSystemPrompt || !injectionFixUserPrompt) {
        console.log(' Injection Fix Prompts not found');
        return { error: 'Injection Fix Prompts not found' };
    }
    if (!injectionFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return {
            error: 'Injected in Biased Fix User  Prompt variables not found',
        };
    }

    let initialInjectionCheck: VariableInjectionResult =
        await checkVariableInjection(inputPrompt);
    if (initialInjectionCheck.error) {
        return { error: initialInjectionCheck.error };
    }
    if (
        initialInjectionCheck.vulnerable &&
        initialInjectionCheck.vulnerable === 'No'
    ) {
        return {
            error: 'Prompt is not vulnerable to variable injections. No need to fix.',
        };
    }

    let InjectionVulnerabilityFixPromises = [];
    let fix_attempt_count = 0;

    // inject the prompt and the reasoning into the bias fix prompt
    let tempVulnFixUserPrompt = prepareFixPrompt(
        injectionFixUserPrompt,
        inputPrompt.normalizedText,
        initialInjectionCheck
    );

    InjectionVulnerabilityFixPromises.push(
        processPromptFix(
            injectionFixSystemPrompt.content,
            tempVulnFixUserPrompt
        )
    );
    // }

    let fixedPrompts: Array<string> = [];
    const numberOfSuggestions = 5;
    const maxNumberOfGenerationAttempts = 10;
    while (
        InjectionVulnerabilityFixPromises.length !== 0 &&
        (fixedPrompts.length < numberOfSuggestions ||
            fix_attempt_count < maxNumberOfGenerationAttempts)
    ) {
        fix_attempt_count += 1;
        let fixResultsJSONs = await Promise.all(
            InjectionVulnerabilityFixPromises
        );
        // flatten the array of prompts
        let allPrompts: Array<string> = [];
        for (let i = 0; i < fixResultsJSONs.length; i++) {
            if (!fixResultsJSONs[i].error) {
                let fixResult = fixResultsJSONs[i] as fixInjectionResult;
                allPrompts = allPrompts.concat(fixResult.prompts!);
            }
        }
        InjectionVulnerabilityFixPromises = [];
        let VulnCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            // extract variables between {{ }} from allPrompts[i] and create dictionary with key as variable name and value as empty string
            const regex = /{{(.*?)}}/g;
            let match;
            let templateHoles: { [key: string]: any } = {};
            while ((match = regex.exec(allPrompts[i])) !== null) {
                const holeName: string = match[1];
                templateHoles[holeName] = {
                    name: holeName,
                    inferredType: 'string',
                    rawText: match[0],
                    // get the start and end location of the hole in the normalized response in the parsed node
                };
            }
            VulnCheckPromises.push(
                checkVariableInjection({
                    normalizedText: allPrompts[i],
                    // dummy parameters
                    id: '',
                    rawText: '',
                    rawTextOfParentCall: '',
                    startLocation: new Position(0, 0),
                    endLocation: new Position(0, 0),
                    parentCallStartLocation: new Position(0, 0),
                    parentCallEndLocation: new Position(0, 0),
                    templateValues: templateHoles,
                    associatedParameters: {},
                    sourceFilePath: inputPrompt.sourceFilePath,
                })
            );
        }

        const VulnerabilityInjectionCheckResults =
            await Promise.all(VulnCheckPromises);

        for (let i = 0; i < VulnerabilityInjectionCheckResults.length; i++) {
            if (!VulnerabilityInjectionCheckResults[i].error) {
                let prompt = allPrompts[i];
                let injectionVulnerabilityCheckResult =
                    VulnerabilityInjectionCheckResults[
                        i
                    ] as VariableInjectionResult;
                if (
                    injectionVulnerabilityCheckResult.vulnerable &&
                    injectionVulnerabilityCheckResult.vulnerable === 'No'
                ) {
                    fixedPrompts.push(prompt);
                } else {
                    let tempVulnFixUserPrompt = prepareFixPrompt(
                        injectionFixUserPrompt,
                        prompt,
                        injectionVulnerabilityCheckResult
                    );

                    InjectionVulnerabilityFixPromises.push(
                        processPromptFix(
                            injectionFixUserPrompt.content,
                            tempVulnFixUserPrompt
                        )
                    );
                }
            }
        }
        //  return when enough prompts generated
        if (fixedPrompts.length >= numberOfSuggestions) {
            break;
        }
    }

    return {
        prompts: fixedPrompts,
    } as fixInjectionResult;
}

function prepareFixPrompt(
    injectionFixUserPrompt: serializedPrompt,
    inputPrompt: string,
    vulnerabilityCheck: VariableInjectionResult
) {
    //  specify the vulnerabile variables
    let attacks: string[] = [];
    let vulnerableVariables: string[] = [];
    vulnerabilityCheck.poisoned_responses?.forEach((response_tuple) => {
        const vulnerable_variable = response_tuple[0];
        // if vulnerable variable not in the list of vulnerable variables, add it
        if (!vulnerableVariables.includes(vulnerable_variable)) {
            vulnerableVariables.push(vulnerable_variable);
        }
        // if attack not in the list of attacks, add it
        const attack = response_tuple[2];
        if (!attacks.includes(attack)) {
            attacks.push(attack);
        }
    });

    if (!injectionFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return '';
    }
    let tempVulnFixUserPrompt = injectionFixUserPrompt.content;
    let toInject: string[] = [
        inputPrompt,
        JSON.stringify(vulnerableVariables),
        JSON.stringify(attacks),
        // JSON.stringify(initialGenderBiasCheck.reasoning),
    ];
    for (let i = 0; i < toInject.length; i++) {
        tempVulnFixUserPrompt = tempVulnFixUserPrompt.replaceAll(
            '{{' + injectionFixUserPrompt.injectedVariables[i] + '}}',
            toInject[i]
        );
    }
    return tempVulnFixUserPrompt;
}

async function processPromptFix(
    systemPrompt: string,
    userPrompt: string
): Promise<JSONSchemaObject> {
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];
    const result = await LLMUtils.sendChatRequest(
        messages,
        {
            model: LLMUtils.GPTModel.GPT3_5Turbo,
            temperature: 0.0,
            seed: 42,
        },
        undefined,
        true,
        true
    );
    try {
        const JSONResult = JSON.parse(result);
        return JSONResult;
    } catch (e) {
        console.log('Error parsing JSON');
        return { error: 'Error parsing JSON' };
    }
}
