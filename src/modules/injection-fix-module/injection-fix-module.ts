import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
import { PromptMetadata } from '../prompt-finder';
import { patchHoles, unpatchHoles } from '../prompt-finder/hole-patching';
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
    unresolvedKeys?: Array<string[]>;
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
        initialInjectionCheck.vulnerable === undefined ||
        initialInjectionCheck.vulnerable === 'No'
    ) {
        return {
            error: 'Prompt is not vulnerable to variable injections. No need to fix.',
        };
    }
    // extract the system prompt from the yaml file
    // extract the injected variables from the yaml file
    // inject text variables into prompt
    // path prompt holes
    await patchHoles(inputPrompt);
    let InjectionVulnerabilityFixPromises = [];
    let fix_attempt_count = 0;

    // generate patched prompt that only leaves current variable as unpatched
    for (const attack_point in inputPrompt.templateValues) {
        let patchedPrompt = inputPrompt.normalizedText;
        for (const key in inputPrompt.templateValues) {
            if (key === attack_point) {
                continue;
            }
            let value = inputPrompt.templateValues[key].defaultValue;
            patchedPrompt = patchedPrompt.replaceAll('{{' + key + '}}', value);
        }
        // inject the prompt and the reasoning into the bias fix prompt
        let tempBiasFixUserPrompt = prepareFixPrompt(
            injectionFixUserPrompt,
            patchedPrompt
        );
        InjectionVulnerabilityFixPromises.push(
            processPromptFix(
                injectionFixSystemPrompt.content,
                tempBiasFixUserPrompt
            )
        );
    }

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
        let genderBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            genderBiasCheckPromises.push(
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
                    templateValues: {},
                    associatedParameters: {},
                    sourceFilePath: '',
                })
            );
        }

        const VulnerabilityInjectionCheckResults = await Promise.all(
            genderBiasCheckPromises
        );

        for (let i = 0; i < VulnerabilityInjectionCheckResults.length; i++) {
            if (!VulnerabilityInjectionCheckResults[i].error) {
                let prompt = allPrompts[i];
                let injectionVulnerabilityCheckResult =
                    VulnerabilityInjectionCheckResults[
                        i
                    ] as VariableInjectionResult;
                if (
                    !injectionVulnerabilityCheckResult.vulnerable ===
                        undefined &&
                    injectionVulnerabilityCheckResult.vulnerable === 'No'
                ) {
                    fixedPrompts.push(prompt);
                } else {
                    InjectionVulnerabilityFixPromises.push(
                        processPromptFix(injectionFixUserPrompt.content, prompt)
                    );
                }
            }
        }
        //  return when enough prompts generated
        if (fixedPrompts.length >= numberOfSuggestions) {
            break;
        }
    }
    // unpatch the results before returning
    let unresolvedKeys: string[][] = [];
    for (let i = 0; i < fixedPrompts.length; i++) {
        let tuple = unpatchHoles(fixedPrompts[i], inputPrompt);
        fixedPrompts[i] = tuple[0];
        unresolvedKeys = unresolvedKeys.concat(tuple[1]);
    }
    return {
        prompts: fixedPrompts,
        unresolvedKeys: unresolvedKeys,
    } as fixInjectionResult;
}

function prepareFixPrompt(
    injectionFixUserPrompt: serializedPrompt,
    patchedPrompt: string
    // initialGenderBiasCheck: JSONSchemaObject
) {
    if (!injectionFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return '';
    }
    let tempBiasFixUserPrompt = injectionFixUserPrompt.content;
    let toInject: string[] = [
        patchedPrompt,
        // JSON.stringify(initialGenderBiasCheck.reasoning),
    ];
    for (let i = 0; i < toInject.length; i++) {
        tempBiasFixUserPrompt = tempBiasFixUserPrompt.replaceAll(
            '{{' + injectionFixUserPrompt.injectedVariables[i] + '}}',
            toInject[i]
        );
    }
    return tempBiasFixUserPrompt;
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
            temperature: 0.3,
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
