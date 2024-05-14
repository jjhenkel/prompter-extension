import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
import { PromptMetadata } from '../prompt-finder';
import { patchHoles, unpatchHoles } from '../prompt-finder/hole-patching';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import * as LLMUtils from '../LLMUtils';
import { Position } from 'vscode';
import checkVariableInjection from '../injection-module/var-injection-module';
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

    let initialInjectionCheck = await checkVariableInjection(inputPrompt);
    if (initialInjectionCheck.error) {
        return { error: initialInjectionCheck.error };
    }
    if (
        !initialInjectionCheck.gender_biased &&
        !initialInjectionCheck.may_cause_gender_bias
    ) {
        return {
            error: 'Prompt is not gender biased and should not cause gender-biased responses. No need to fix.',
        };
    }
    // extract the system prompt from the yaml file
    // extract the injected variables from the yaml file
    // inject text variables into prompt
    // path prompt holes
    let patchedPrompt = inputPrompt.normalizedText;
    await patchHoles(inputPrompt);
    for (const key in inputPrompt.templateValues) {
        let value = inputPrompt.templateValues[key].defaultValue;
        patchedPrompt = patchedPrompt.replaceAll('{{' + key + '}}', value);
    }
    let genderBiasFixPromises = [];
    let maybeGenderBiasFixPromises = [];
    let fix_attempt_count = 0;

    if (initialInjectionCheck.gender_bias === true) {
        // inject the prompt and the reasoning into the bias fix prompt
        let tempBiasFixUserPrompt = prepareFixPrompt(
            injectionFixUserPrompt,
            patchedPrompt,
            initialInjectionCheck
        );
        genderBiasFixPromises.push(
            processPromptFix(
                injectionFixSystemPrompt.content,
                tempBiasFixUserPrompt
            )
        );
    } else if (initialInjectionCheck.may_cause_gender_bias === true) {
        let tempMaybeBiasFixUserPrompt = prepareFixPrompt(
            maybeBiasFixUserPrompt,
            patchedPrompt,
            initialInjectionCheck
        );
        maybeGenderBiasFixPromises.push(
            processPromptFix(
                maybeBiasFixSystemPrompt.content,
                tempMaybeBiasFixUserPrompt
            )
        );
    }

    let fixedPrompts: Array<string> = [];
    const numberOfSuggestions = 5;
    const maxNumberOfGenerationAttempts = 10;
    while (
        (genderBiasFixPromises.length !== 0 ||
            maybeGenderBiasFixPromises.length !== 0) &&
        (fixedPrompts.length < numberOfSuggestions ||
            fix_attempt_count < maxNumberOfGenerationAttempts)
    ) {
        fix_attempt_count += 1;
        let fixResultsJSONs = await Promise.all(genderBiasFixPromises);
        // flatten the array of prompts
        let allPrompts: Array<string> = [];
        for (let i = 0; i < fixResultsJSONs.length; i++) {
            if (!fixResultsJSONs[i].error) {
                let fixResult = fixResultsJSONs[i] as fixGenderBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            }
        }
        genderBiasFixPromises = [];
        let genderBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            genderBiasCheckPromises.push(
                checkGenderBias({
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

        const genderBiasCheckResults = await Promise.all(
            genderBiasCheckPromises
        );

        for (let i = 0; i < genderBiasCheckResults.length; i++) {
            if (!genderBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let genderBiasCheckResult = genderBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !genderBiasCheckResult.gender_biased &&
                    !genderBiasCheckResult.may_cause_gender_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialInjectionCheck.may_cause_gender_bias) {
                    maybeGenderBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    genderBiasFixPromises.push(
                        processPromptFix(injectionFixUserPrompt.content, prompt)
                    );
                }
            }
        }
        //  return when enough prompts generated
        // otherwise, try to fix the may cause bias prompts
        if (fixedPrompts.length >= numberOfSuggestions) {
            break;
        }
        let maybeFixResultsJSONs = await Promise.all(
            maybeGenderBiasFixPromises
        );
        maybeGenderBiasFixPromises = [];
        allPrompts = [];
        for (let i = 0; i < maybeFixResultsJSONs.length; i++) {
            if (!maybeFixResultsJSONs[i].error) {
                let fixResult = maybeFixResultsJSONs[i] as fixGenderBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            } else {
                console.log('Error in maybe fix');
                console.log(maybeFixResultsJSONs[i].error);
            }
        }

        let maybeGenderBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            let prompt = allPrompts[i];
            maybeGenderBiasCheckPromises.push(
                checkGenderBias({
                    normalizedText: prompt,
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
        const maybeGenderBiasCheckResults = await Promise.all(
            maybeGenderBiasCheckPromises
        );
        for (let i = 0; i < maybeGenderBiasCheckResults.length; i++) {
            if (!maybeGenderBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let genderBiasCheckResult = maybeGenderBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !genderBiasCheckResult.gender_biased &&
                    !genderBiasCheckResult.may_cause_gender_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialInjectionCheck.may_cause_gender_bias) {
                    maybeGenderBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    genderBiasFixPromises.push(
                        processPromptFix(injectionFixUserPrompt.content, prompt)
                    );
                }
            }
        }
        // if it's still less than 5, will try again...
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
    } as fixGenderBiasResult;
}

function prepareFixPrompt(
    biasFixUserPrompt: serializedPrompt,
    patchedPrompt: string,
    initialGenderBiasCheck: JSONSchemaObject
) {
    if (!biasFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return '';
    }
    let tempBiasFixUserPrompt = biasFixUserPrompt.content;
    let toInject: string[] = [
        patchedPrompt,
        JSON.stringify(initialGenderBiasCheck.reasoning),
    ];
    for (let i = 0; i < toInject.length; i++) {
        tempBiasFixUserPrompt = tempBiasFixUserPrompt.replaceAll(
            '{{' + biasFixUserPrompt.injectedVariables[i] + '}}',
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
