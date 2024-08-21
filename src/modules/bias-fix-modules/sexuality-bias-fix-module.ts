import { JSONSchemaObject } from 'openai/lib/jsonschema';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
import { PromptMetadata } from '../prompt-finder';
import { patchHoles, unpatchHoles } from '../prompt-finder/hole-patching';
// import checkGenderBias from '../bias-modules/gender-bias-module';
import checkSexualityBias from '../bias-modules/sexuality-bias-module';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import * as LLMUtils from '../LLMUtils';
// import { Position } from 'vscode';
export type promptRole = 'user' | 'system' | 'assistant';

export type serializedPrompt = {
    role: promptRole;
    content: string;
    injectedVariables?: Array<string>;
};

export type fixSexualityBiasResult = {
    prompts: Array<string>;
    unresolvedKeys: Array<string[]>;
};

export async function fixSexualityBias(
    inputPrompt: PromptMetadata
): Promise<JSONSchemaObject | fixSexualityBiasResult> {
    // inputPrompt: PromptMetadata
    // extract the prompt from the yaml file
    let biasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'sexuality_fix_prompt_1.yaml'),
            'utf8'
        )
    ) as Array<serializedPrompt>;
    // extract the user prompt from the yaml file
    let biasFixSystemPrompt = biasFixPromptYaml.find(
        (prompt) => prompt.role === 'system'
    );
    let biasFixUserPrompt = biasFixPromptYaml.find(
        (prompt) => prompt.role === 'user'
    );
    if (!biasFixSystemPrompt || !biasFixUserPrompt) {
        console.log(' sexuality Bias Fix Prompts not found');
        return { error: 'sexuality Bias Fix Prompts not found' };
    }
    if (!biasFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return {
            error: 'Injected in Biased Fix User  Prompt variables not found',
        };
    }
    let maybeBiasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'may_sexuality_fix_prompt_1.yaml'),
            'utf8'
        )
    ) as Array<serializedPrompt>;
    // extract the user prompt from the yaml file
    let maybeBiasFixSystemPrompt = maybeBiasFixPromptYaml.find(
        (prompt) => prompt.role === 'system'
    );
    let maybeBiasFixUserPrompt = maybeBiasFixPromptYaml.find(
        (prompt) => prompt.role === 'user'
    );
    if (!maybeBiasFixSystemPrompt || !maybeBiasFixUserPrompt) {
        console.log(' Possible sexuality Bias Fix Prompts not found');
        return { error: 'Possible sexuality Bias Fix Prompts not found' };
    }
    if (!maybeBiasFixUserPrompt.injectedVariables) {
        console.log(
            'Injected variables in Maybe Biased Fix User Prompt not found'
        );
        return {
            error: 'Injected in Maybe Biased Fix  User Prompt variables not found',
        };
    }
    let initialsexualityBiasCheck = await checkSexualityBias(inputPrompt);
    if (initialsexualityBiasCheck.error) {
        return { error: initialsexualityBiasCheck.error };
    }
    if (
        !initialsexualityBiasCheck.sexuality_biased &&
        !initialsexualityBiasCheck.may_cause_sexuality_bias
    ) {
        return {
            error: 'Prompt is not sexuality biased and should not cause sexuality-biased responses. No need to fix.',
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
    let sexualityBiasFixPromises = [];
    let maybesexualityBiasFixPromises = [];
    let fix_attempt_count = 0;

    if (initialsexualityBiasCheck.sexuality_biased === true) {
        // inject the prompt and the reasoning into the bias fix prompt
        let tempBiasFixUserPrompt = prepareFixPrompt(
            biasFixUserPrompt,
            patchedPrompt,
            initialsexualityBiasCheck
        );
        sexualityBiasFixPromises.push(
            processPromptFix(biasFixSystemPrompt.content, tempBiasFixUserPrompt)
        );
    } else if (initialsexualityBiasCheck.may_cause_sexuality_bias === true) {
        let tempMaybeBiasFixUserPrompt = prepareFixPrompt(
            maybeBiasFixUserPrompt,
            patchedPrompt,
            initialsexualityBiasCheck
        );
        maybesexualityBiasFixPromises.push(
            processPromptFix(
                maybeBiasFixSystemPrompt.content,
                tempMaybeBiasFixUserPrompt
            )
        );
    }

    let fixedPrompts: Array<string> = [];
    const numberOfSuggestions = 1;
    const maxNumberOfGenerationAttempts = 10;
    while (
        (sexualityBiasFixPromises.length !== 0 ||
            maybesexualityBiasFixPromises.length !== 0) &&
        (fixedPrompts.length < numberOfSuggestions ||
            fix_attempt_count < maxNumberOfGenerationAttempts)
    ) {
        fix_attempt_count += 1;
        let fixResultsJSONs = await Promise.all(sexualityBiasFixPromises);
        // flatten the array of prompts
        let allPrompts: Array<string> = [];
        for (let i = 0; i < fixResultsJSONs.length; i++) {
            if (!fixResultsJSONs[i].error) {
                let fixResult = fixResultsJSONs[i] as fixSexualityBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            }
        }
        sexualityBiasFixPromises = [];
        let sexualityBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            sexualityBiasCheckPromises.push(
                checkSexualityBias({
                    normalizedText: allPrompts[i],
                    // dummy parameters
                    id: '',
                    rawText: '',
                    rawTextOfParentCall: '',
                    startLocation: 0,
                    endLocation: 0,
                    parentCallStartLocation: 0,
                    parentCallEndLocation: 0,
                    templateValues: {},
                    associatedParameters: {},
                    sourceFilePath: '',
                })
            );
        }

        const sexualityBiasCheckResults = await Promise.all(
            sexualityBiasCheckPromises
        );

        for (let i = 0; i < sexualityBiasCheckResults.length; i++) {
            if (!sexualityBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let sexualityBiasCheckResult = sexualityBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !sexualityBiasCheckResult.sexuality_biased &&
                    !sexualityBiasCheckResult.may_cause_sexuality_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialsexualityBiasCheck.may_cause_sexuality_bias) {
                    maybesexualityBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    sexualityBiasFixPromises.push(
                        processPromptFix(biasFixUserPrompt.content, prompt)
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
            maybesexualityBiasFixPromises
        );
        maybesexualityBiasFixPromises = [];
        allPrompts = [];
        for (let i = 0; i < maybeFixResultsJSONs.length; i++) {
            if (!maybeFixResultsJSONs[i].error) {
                let fixResult = maybeFixResultsJSONs[
                    i
                ] as fixSexualityBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            } else {
                console.log('Error in maybe fix');
                console.log(maybeFixResultsJSONs[i].error);
            }
        }

        let maybesexualityBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            let prompt = allPrompts[i];
            maybesexualityBiasCheckPromises.push(
                checkSexualityBias({
                    normalizedText: prompt,
                    // dummy parameters
                    id: '',
                    rawText: '',
                    rawTextOfParentCall: '',
                    startLocation: 0,
                    endLocation: 0,
                    parentCallStartLocation: 0,
                    parentCallEndLocation: 0,
                    templateValues: {},
                    associatedParameters: {},
                    sourceFilePath: '',
                })
            );
        }
        const maybesexualityBiasCheckResults = await Promise.all(
            maybesexualityBiasCheckPromises
        );
        for (let i = 0; i < maybesexualityBiasCheckResults.length; i++) {
            if (!maybesexualityBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let sexualityBiasCheckResult = maybesexualityBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !sexualityBiasCheckResult.sexuality_biased &&
                    !sexualityBiasCheckResult.may_cause_sexuality_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialsexualityBiasCheck.may_cause_sexuality_bias) {
                    maybesexualityBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    sexualityBiasFixPromises.push(
                        processPromptFix(biasFixUserPrompt.content, prompt)
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
    } as fixSexualityBiasResult;
}

function prepareFixPrompt(
    biasFixUserPrompt: serializedPrompt,
    patchedPrompt: string,
    initialsexualityBiasCheck: JSONSchemaObject
) {
    if (!biasFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return '';
    }
    let tempBiasFixUserPrompt = biasFixUserPrompt.content;
    let toInject: string[] = [
        patchedPrompt,
        JSON.stringify(initialsexualityBiasCheck.reasoning),
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
