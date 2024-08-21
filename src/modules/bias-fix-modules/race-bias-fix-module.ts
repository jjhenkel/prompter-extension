import { JSONSchemaObject } from 'openai/lib/jsonschema';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
import { PromptMetadata } from '../prompt-finder';
import { patchHoles, unpatchHoles } from '../prompt-finder/hole-patching';
// import checkGenderBias from '../bias-modules/gender-bias-module';
import checkRaceBias from '../bias-modules/race-bias-module';
import { ChatCompletionMessageParam } from 'openai/resources/index';
import * as LLMUtils from '../LLMUtils';
// import { Position } from 'vscode';
export type promptRole = 'user' | 'system' | 'assistant';

export type serializedPrompt = {
    role: promptRole;
    content: string;
    injectedVariables?: Array<string>;
};

export type fixRaceBiasResult = {
    prompts: Array<string>;
    unresolvedKeys: Array<string[]>;
};

export async function fixRaceBias(
    inputPrompt: PromptMetadata
): Promise<JSONSchemaObject | fixRaceBiasResult> {
    // inputPrompt: PromptMetadata
    // extract the prompt from the yaml file
    let biasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'race_fix_prompt_1.yaml'),
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
        console.log(' race Bias Fix Prompts not found');
        return { error: 'race Bias Fix Prompts not found' };
    }
    if (!biasFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return {
            error: 'Injected in Biased Fix User  Prompt variables not found',
        };
    }
    let maybeBiasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'may_race_fix_prompt_1.yaml'),
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
        console.log(' Possible race Bias Fix Prompts not found');
        return { error: 'Possible race Bias Fix Prompts not found' };
    }
    if (!maybeBiasFixUserPrompt.injectedVariables) {
        console.log(
            'Injected variables in Maybe Biased Fix User Prompt not found'
        );
        return {
            error: 'Injected in Maybe Biased Fix  User Prompt variables not found',
        };
    }
    let initialraceBiasCheck = await checkRaceBias(inputPrompt);
    if (initialraceBiasCheck.error) {
        return { error: initialraceBiasCheck.error };
    }
    if (
        !initialraceBiasCheck.race_biased &&
        !initialraceBiasCheck.may_cause_race_bias
    ) {
        return {
            error: 'Prompt is not race biased and should not cause race-biased responses. No need to fix.',
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
    let raceBiasFixPromises = [];
    let mayberaceBiasFixPromises = [];
    let fix_attempt_count = 0;

    if (initialraceBiasCheck.race_biased === true) {
        // inject the prompt and the reasoning into the bias fix prompt
        let tempBiasFixUserPrompt = prepareFixPrompt(
            biasFixUserPrompt,
            patchedPrompt,
            initialraceBiasCheck
        );
        raceBiasFixPromises.push(
            processPromptFix(biasFixSystemPrompt.content, tempBiasFixUserPrompt)
        );
    } else if (initialraceBiasCheck.may_cause_race_bias === true) {
        let tempMaybeBiasFixUserPrompt = prepareFixPrompt(
            maybeBiasFixUserPrompt,
            patchedPrompt,
            initialraceBiasCheck
        );
        mayberaceBiasFixPromises.push(
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
        (raceBiasFixPromises.length !== 0 ||
            mayberaceBiasFixPromises.length !== 0) &&
        (fixedPrompts.length < numberOfSuggestions ||
            fix_attempt_count < maxNumberOfGenerationAttempts)
    ) {
        fix_attempt_count += 1;
        let fixResultsJSONs = await Promise.all(raceBiasFixPromises);
        // flatten the array of prompts
        let allPrompts: Array<string> = [];
        for (let i = 0; i < fixResultsJSONs.length; i++) {
            if (!fixResultsJSONs[i].error) {
                let fixResult = fixResultsJSONs[i] as fixRaceBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            }
        }
        raceBiasFixPromises = [];
        let raceBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            raceBiasCheckPromises.push(
                checkRaceBias({
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

        const raceBiasCheckResults = await Promise.all(raceBiasCheckPromises);

        for (let i = 0; i < raceBiasCheckResults.length; i++) {
            if (!raceBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let raceBiasCheckResult = raceBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !raceBiasCheckResult.race_biased &&
                    !raceBiasCheckResult.may_cause_race_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialraceBiasCheck.may_cause_race_bias) {
                    mayberaceBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    raceBiasFixPromises.push(
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
        let maybeFixResultsJSONs = await Promise.all(mayberaceBiasFixPromises);
        mayberaceBiasFixPromises = [];
        allPrompts = [];
        for (let i = 0; i < maybeFixResultsJSONs.length; i++) {
            if (!maybeFixResultsJSONs[i].error) {
                let fixResult = maybeFixResultsJSONs[i] as fixRaceBiasResult;
                allPrompts = allPrompts.concat(fixResult.prompts);
            } else {
                console.log('Error in maybe fix');
                console.log(maybeFixResultsJSONs[i].error);
            }
        }

        let mayberaceBiasCheckPromises = [];
        for (let i = 0; i < allPrompts.length; i++) {
            let prompt = allPrompts[i];
            mayberaceBiasCheckPromises.push(
                checkRaceBias({
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
        const mayberaceBiasCheckResults = await Promise.all(
            mayberaceBiasCheckPromises
        );
        for (let i = 0; i < mayberaceBiasCheckResults.length; i++) {
            if (!mayberaceBiasCheckResults[i].error) {
                let prompt = allPrompts[i];
                let raceBiasCheckResult = mayberaceBiasCheckResults[
                    i
                ] as JSONSchemaObject;
                if (
                    !raceBiasCheckResult.race_biased &&
                    !raceBiasCheckResult.may_cause_race_bias
                ) {
                    fixedPrompts.push(prompt);
                } else if (initialraceBiasCheck.may_cause_race_bias) {
                    mayberaceBiasFixPromises.push(
                        processPromptFix(maybeBiasFixUserPrompt.content, prompt)
                    );
                } else {
                    raceBiasFixPromises.push(
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
    } as fixRaceBiasResult;
}

function prepareFixPrompt(
    biasFixUserPrompt: serializedPrompt,
    patchedPrompt: string,
    initialraceBiasCheck: JSONSchemaObject
) {
    if (!biasFixUserPrompt.injectedVariables) {
        console.log('Injected variables in Biased Fix User Prompt not found');
        return '';
    }
    let tempBiasFixUserPrompt = biasFixUserPrompt.content;
    let toInject: string[] = [
        patchedPrompt,
        JSON.stringify(initialraceBiasCheck.reasoning),
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
