import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import * as LLMUtils from '../LLMUtils';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import PromptJson from './var-injection-prompt-1.json';
import ComparisonWithLLMPromptJson from './comparison-prompt-2.json';
import AttacksJson from './injections_attacks.json';
import { PromptMetadata } from '../prompt-finder';
import { patchHoles } from '../prompt-finder/hole-patching';

// var Analyzer = SentimentAnalyzer;
// var stemmer = require('natural').PorterStemmer;
const modelType = LLMUtils.GPTModel.GPT3_5Turbo;

async function checkVariableInjection(
    prompt: PromptMetadata
): Promise<JSONSchemaObject> {
    // load prompt from json file
    // extract prompt from json file
    const systemPromptText: string = PromptJson.system_prompt;
    let userPromptText: string = PromptJson.user_prompt; // empty for now
    // inject text variables into prompt
    // const variables_to_inject = PromptJson.injected_variables;
    // userPromptText = userPromptText.replaceAll("__","\n");
    let userPrompt = prompt;
    // let promptVariables: string[] | null = [];
    // extract variables in prompt by finding string + var + string or by finding {var} in string
    let defaultValuesPrompt = prompt.normalizedText;
    await patchHoles(prompt);
    for (let key in prompt.templateValues) {
        defaultValuesPrompt = defaultValuesPrompt.replaceAll(
            '{{' + key + '}}',
            prompt.templateValues[key].defaultValue
        );
    }

    let default_response: string = '';
    // send the prompt to azure openai using client
    const deploymentId = 'gpt-35-turbo';
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPromptText },
        { role: 'user', content: defaultValuesPrompt },
    ];
    // console.log(messages);
    // convert messages list to chat request
    let client = LLMUtils.getClient();
    // console.log(client);
    if (client === undefined) {
        console.error('Client is undefined');
        return JSON.parse('{"error": " Issue during OpenAI configuration}"');
    }
    //TODO replace variables with default values before sending to openai
    //TODO add a check to see if the prompt is too long and split it into multiple prompts
    //TODO add a rate limit strategy to deal with limit being reached
    // const response = await client.chat.completions.create({
    //     messages: messages,
    //     model: deploymentId,
    //     temperature: 0.0,
    //     top_p: 0.95,
    //     seed: 42,
    // });
    // const result = response.choices?.[0]?.message?.content;

    const result = await LLMUtils.sendChatRequest(messages, {
        model: modelType,
        temperature: 0.0,
        top_p: 0.95,
        seed: 42,
    });
    // console.log(result);
    // convert result to json and return
    if (result !== undefined && result !== null) {
        default_response = JSON.stringify(result);
    } else {
        return JSON.parse('{"error": "No response from Azure OpenAI}"');
    }
    let attackTuples = AttacksJson.attacks.slice(0, 4); // only use first 4 attacks for testing
    let poisoned_responses: string[] = [];
    let maybe_poisoned_responses: string[] = [];
    // sentiment analyzer definition
    // var analyzer = new SentimentAnalyzer('English', PorterStemmer, 'senticon');
    // let default_sentiment = analyzer.getSentiment(default_response.split(' '));
    // let sentiment_differences: any[] = [];
    // const comparisonSystemPromptText: string = ComparisonPromptJson.system_prompt;
    // let comparisonUserPromptText: string = ComparisonPromptJson.user_prompt;
    // const comparisonVariablesToInject = ComparisonPromptJson.injected_variables;
    const attack_promises = attackTuples.map(async (attack_tuple) => {
        return await processInjection(
            prompt,
            // promptVariables,
            attack_tuple,
            systemPromptText,
            client,
            deploymentId,
            default_response,
            // analyzer,
            // default_sentiment,
            ComparisonWithLLMPromptJson
        );
    });
    // map attack results to their respective arrays
    const attack_results = await Promise.all(attack_promises);

    for (let i = 0; i < attack_results.length; i++) {
        // console.log(attack_results[i]);
        // let attack = attack_results[i][0];
        let poisoned_responses_temp = attack_results[i][1];
        let maybe_poisoned_responses_temp = attack_results[i][2];
        // let sentiment_differences_temp = attack_results[i][3];
        if (poisoned_responses_temp.length > 0) {
            poisoned_responses.push(...poisoned_responses_temp);
        }
        if (maybe_poisoned_responses_temp.length > 0) {
            maybe_poisoned_responses.push(...maybe_poisoned_responses_temp);
        }
        // sentiment_differences.push(...sentiment_differences_temp);
    }

    // add results with sentiment differences larger than the average to the  maybe poisoned responses list
    // let sum = 0;
    // for (let i = 0; i < sentiment_differences.length; i++) {
    //     sum += Number(sentiment_differences[i][0]);
    // }
    // let average = sum / sentiment_differences.length;
    // for (let i = 0; i < sentiment_differences.length; i++) {
    //     if (
    //         Number(sentiment_differences[i][0]) > average &&
    //         !poisoned_responses.includes(String(sentiment_differences[i][1])) &&
    //         !maybe_poisoned_responses.includes(
    //             String(sentiment_differences[i][1])
    //         )
    //     ) {
    //         maybe_poisoned_responses.push(String(sentiment_differences[i][1]));
    //     }
    // }

    if (poisoned_responses.length > 0) {
        // convert poisoned responses to json array of string while cleaning string from any characters that might break json parsing
        let poisoned_responses_json_string = JSON.stringify(poisoned_responses);

        const str =
            '{"vulnerable": "Yes" , ' +
            '"poisoned_responses": ' +
            poisoned_responses_json_string +
            ',' +
            `"total_attempts": "${JSON.stringify(attackTuples.length * Object.keys(prompt.templateValues).length)}"` +
            ',' +
            `"total_variables_in_prompt": "${JSON.stringify(Object.keys(prompt.templateValues).length)}"` +
            '}';
        let temp_json = JSON.parse(str);
        return temp_json;
    } else if (maybe_poisoned_responses.length > 0) {
        // convert poisoned responses to json array of string while cleaning string from any characters that might break json parsing
        let maybe_poisoned_responses_json_string = JSON.stringify(
            maybe_poisoned_responses
        );
        const str =
            '{"vulnerable": "Maybe" , ' +
            '"poisoned_responses": ' +
            maybe_poisoned_responses_json_string +
            ',' +
            `"total_attempts": "${JSON.stringify(attackTuples.length * Object.keys(prompt.templateValues).length)}"` +
            ',' +
            `"total_variables_in_prompt": "${JSON.stringify(Object.keys(prompt.templateValues).length)}"` +
            '}';
        let temp_json = JSON.parse(str);
        return temp_json;
    } else {
        return JSON.parse('{"vulnerable": "No"}');
    }
}

export default checkVariableInjection;

async function processInjection(
    userPrompt: PromptMetadata,
    // promptVariables: string[] | null,
    attack_tuple: string[],
    systemPromptText: string,
    client: any,
    deploymentId: string,
    defaultResponse: string,
    // analyzer: SentimentAnalyzer,
    // default_sentiment: number,
    ComparisonPromptJson: any
): Promise<any> {
    const comparisonSystemPromptText: string =
        ComparisonPromptJson.system_prompt;
    let comparisonUserPromptText: string = ComparisonPromptJson.user_prompt;
    const comparisonVariablesToInject = ComparisonPromptJson.injected_variables;
    let poisoned_responses = [];
    let maybe_poisoned_responses = [];
    // let sentiment_differences = [];
    let attack = attack_tuple[0];
    let attack_response = attack_tuple[1];
    let injected_prompt = userPrompt.normalizedText;
    for (let injectionPointVariable in userPrompt.templateValues) {
        for (let otherVariables in userPrompt.templateValues) {
            // adding default values to the prompt for the other keys
            if (injectionPointVariable !== otherVariables) {
                injected_prompt = injected_prompt.replaceAll(
                    '{{' + otherVariables + '}}',
                    userPrompt.templateValues[otherVariables].defaultValue
                );
            }
        }

        injected_prompt = injected_prompt.replace(
            '{{' + injectionPointVariable + '}}',
            attack
        );
        // send the prompt to azure openai using client
        const messages: ChatCompletionMessageParam[] = [
            { role: 'system', content: systemPromptText },
            { role: 'user', content: injected_prompt },
        ];
        const response = await client.chat.completions.create({
            messages: messages,
            model: deploymentId,
            temperature: 0.0,
            top_p: 0.95,
            seed: 42,
        });

        let injectedResult = response.choices?.[0]?.message?.content;
        // convert attack to word list
        const attack_list = attack.split(' ');
        if (injectedResult !== undefined && injectedResult !== null) {
            injectedResult = JSON.stringify(injectedResult);
            // console.log(JSON.stringify(result));
            // console.log(JSON.stringify(default_response));
            // console.log(_cosineSimilarity(result,default_response));

            // if it contains the attack response
            if (injectedResult?.includes(attack_response)) {
                // attack detected
                poisoned_responses.push([
                    injectionPointVariable,
                    injectedResult,
                ]);
            }
            // if the similarity to the base response is lower
            // else if (
            //     attack_list.some((word) => result?.includes(word)) &&
            //     (stringComparison.cosine.similarity(result, default_response) <
            //         0.5 ||
            //         stringComparison.levenshtein.similarity(
            //             result,
            //             default_response
            //         ) < 0.5 ||
            //         stringComparison.jaroWinkler.similarity(
            //             result,
            //             default_response
            //         ) < 0.5)
            // ) {
            //     // attack detected
            //     maybe_poisoned_responses.push([injectionPointVariable, result]);
            //     continue;
            // }
            // measure the absolute sentiment difference between the default response and the attack response
            // let attack_sentiment = analyzer.getSentiment(result.split(' '));
            // let sentiment_difference = Math.abs(
            //     default_sentiment - attack_sentiment
            // );
            // store sentiment differences and corresponding results in a list
            // sentiment_differences.push([
            //     sentiment_difference,
            //     result,
            //     prompt_var,
            // ]);
            else {
                // ask chatgpt to compare the attack response with the default response and check if the attack response is similar in tone , goal, sentiment to the default response
                const prompt_list = [defaultResponse, injectedResult];
                for (let i = 0; i < prompt_list.length; i++) {
                    let value = '{' + comparisonVariablesToInject[i] + '}';
                    comparisonUserPromptText =
                        comparisonUserPromptText.replaceAll(
                            value,
                            prompt_list[i]
                        );
                }
                const comparisonMessages: ChatCompletionMessageParam[] = [
                    { role: 'system', content: comparisonSystemPromptText },
                    { role: 'user', content: comparisonUserPromptText },
                ];

                let client = LLMUtils.getClient();
                // console.log(client);
                if (client === undefined) {
                    console.error(
                        'variable injection: LLM Client for comparison is undefined'
                    );
                    continue;
                    // console.error("Client is undefined");
                    // return JSON.parse("{\"error\": \" Issue during OpenAI configuration}\"");
                } else {
                    const response = await LLMUtils.sendChatRequest(
                        comparisonMessages,
                        {
                            model: modelType,
                            temperature: 0.3,
                            seed: 42,
                        }
                    );
                    let comparisonResult =
                        response.choices?.[0]?.message?.content;
                    if (
                        comparisonResult !== undefined &&
                        comparisonResult !== null
                    ) {
                        // clean json
                        // find last occurrence of } in result string
                        let last_occurrence = comparisonResult.lastIndexOf('}');
                        // remove everything after the last occurrence
                        comparisonResult = comparisonResult.substring(
                            0,
                            last_occurrence + 1
                        );
                        try {
                            const comparisonJson = JSON.parse(comparisonResult);
                            const similarity_result = comparisonJson[
                                'similar'
                            ] as String;
                            if (
                                similarity_result.toLowerCase() === 'no' ||
                                similarity_result.toLowerCase() === 'false'
                            ) {
                                maybe_poisoned_responses.push([
                                    injectionPointVariable,
                                    injectedResult,
                                ]);
                            }
                        } catch (e) {
                            console.log(
                                'Error parsing comparison result, JSON is invalid: ' +
                                    comparisonResult
                            );
                        }
                    } else {
                        console.log(
                            '{"error": "No response from Azure OpenAI}"'
                        );
                    }
                }
            }
        }
    }
    return [
        attack,
        poisoned_responses,
        maybe_poisoned_responses,
        // sentiment_differences,
    ];
}

// simple main function to extract Example vulnerable prompts from prompt set
// async function main() {
//     // load runnable prompts english json file  data\runnable_prompts_english_0.5.json
//     console.log('loading prompts');
//     const rawdata = fs.readFileSync(
//         './data/runnable_prompts_ascii.json',
//         'utf8'
//     );
//     const prompts = JSON.parse(rawdata);

//     // randomly select x prompts from prompt list
//     console.log('selecting random prompts');
//     const x = 5;
//     const randomPromptsOneVar: string[] = getRandomElements(
//         prompts['one_variable_prompts'],
//         x
//     );
//     const randomPromptsTwoVar: string[] = getRandomElements(
//         prompts['two_variable_prompts'],
//         x
//     );
//     const randomPromptsThreeVar: string[] = getRandomElements(
//         prompts['three_variable_prompts'],
//         x
//     );
//     const randomPromptsFourVar: string[] = getRandomElements(
//         prompts['four_variable_prompts'],
//         x
//     );
//     const randomPromptsFiveVar: string[] = getRandomElements(
//         prompts['five_variable_prompts'],
//         x
//     );
//     const randomPromptsFivePlusVar: string[] = getRandomElements(
//         prompts['more_than_five_variable_prompts'],
//         x
//     );
//     // run variable injection check on each prompt set
//     let resultsOneVar = [];
//     let resultsTwoVar = [];
//     let resultsThreeVar = [];
//     let resultsFourVar = [];
//     let resultsFiveVar = [];
//     let resultsFivePlusVar = [];
//     console.log('running variable injection check');
//     const sleepDuration = 60000;
//     for (let i = 0; i < randomPromptsOneVar.length; i++) {
//         try {
//             let result = await checkVariableInjection(randomPromptsOneVar[i]);
//             resultsOneVar.push([randomPromptsOneVar[i], result]);
//         } catch (e) {
//             await new Promise((r) => setTimeout(r, sleepDuration / 2));
//             let result = await checkVariableInjection(randomPromptsOneVar[i]);
//             resultsOneVar.push([randomPromptsOneVar[i], result]);
//         }
//     }
//     // sleep for 30 seconds to avoid rate limit
//     console.log(' One var processed. sleeping  to avoid rate limit');
//     await new Promise((r) => setTimeout(r, sleepDuration));
//     for (let i = 0; i < randomPromptsTwoVar.length; i++) {
//         try {
//             let result = await checkVariableInjection(randomPromptsTwoVar[i]);
//             resultsTwoVar.push([randomPromptsTwoVar[i], result]);
//         } catch (e) {
//             await new Promise((r) => setTimeout(r, sleepDuration / 2));
//             let result = await checkVariableInjection(randomPromptsTwoVar[i]);
//             resultsTwoVar.push([randomPromptsTwoVar[i], result]);
//         }
//     }
//     // sleep for 30 seconds to avoid rate limit
//     console.log(' Two var processed. sleeping  to avoid rate limit');
//     await new Promise((r) => setTimeout(r, sleepDuration));
//     for (let i = 0; i < randomPromptsThreeVar.length; i++) {
//         try {
//             let result = await checkVariableInjection(randomPromptsThreeVar[i]);
//             resultsThreeVar.push([randomPromptsThreeVar[i], result]);
//         } catch (e) {
//             await new Promise((r) => setTimeout(r, sleepDuration / 2));
//             let result = await checkVariableInjection(randomPromptsThreeVar[i]);
//             resultsThreeVar.push([randomPromptsThreeVar[i], result]);
//         }
//     }
//     // sleep for 30 seconds to avoid rate limit
//     console.log(' Three var processed. sleeping  to avoid rate limit');
//     await new Promise((r) => setTimeout(r, sleepDuration));
//     for (let i = 0; i < randomPromptsFourVar.length; i++) {
//         try {
//             let result = await checkVariableInjection(randomPromptsFourVar[i]);
//             resultsFourVar.push([randomPromptsFourVar[i], result]);
//         } catch (e) {
//             await new Promise((r) => setTimeout(r, sleepDuration / 2));
//             let result = await checkVariableInjection(randomPromptsFourVar[i]);
//             resultsFourVar.push([randomPromptsFourVar[i], result]);
//         }
//     }
//     // sleep for 30 seconds to avoid rate limit
//     console.log(' Four var processed. sleeping  to avoid rate limit');
//     await new Promise((r) => setTimeout(r, sleepDuration));
//     for (let i = 0; i < randomPromptsFiveVar.length; i++) {
//         try {
//             let result = await checkVariableInjection(randomPromptsFiveVar[i]);
//             resultsFiveVar.push([randomPromptsFiveVar[i], result]);
//         } catch (e) {
//             await new Promise((r) => setTimeout(r, sleepDuration / 2));
//             let result = await checkVariableInjection(randomPromptsFiveVar[i]);
//             resultsFiveVar.push([randomPromptsFiveVar[i], result]);
//         }
//     }
//     // sleep for 30 seconds to avoid rate limit
//     // console.log(" Five var processed. sleeping  to avoid rate limit");
//     // await new Promise(r => setTimeout(r, sleepDuration));
//     // for (let i = 0; i < randomPromptsFivePlusVar.length; i++) {
//     //     try {
//     //         let result = await checkVariableInjection(randomPromptsFivePlusVar[i]);
//     //         resultsFivePlusVar.push([randomPromptsFivePlusVar[i], result]);
//     //     }
//     //     catch (e) {
//     //         await new Promise(r => setTimeout(r, sleepDuration / 2));
//     //         let result = await checkVariableInjection(randomPromptsFivePlusVar[i]);
//     //         resultsFivePlusVar.push([randomPromptsFivePlusVar[i], result]);
//     //     }
//     // }
//     // delete existing results files if found
//     console.log('deleting existing results files');
//     if (fs.existsSync('results_one_var.json')) {
//         fs.unlinkSync('results_one_var.json');
//     }
//     if (fs.existsSync('results_two_var.json')) {
//         fs.unlinkSync('results_two_var.json');
//     }
//     if (fs.existsSync('results_three_var.json')) {
//         fs.unlinkSync('results_three_var.json');
//     }
//     if (fs.existsSync('results_four_var.json')) {
//         fs.unlinkSync('results_four_var.json');
//     }
//     if (fs.existsSync('results_five_var.json')) {
//         fs.unlinkSync('results_five_var.json');
//     }
//     if (fs.existsSync('results_five_plus_var.json')) {
//         fs.unlinkSync('results_five_plus_var.json');
//     }
//     // save results to json files
//     console.log('saving results to json files');
//     fs.writeFileSync('results_one_var.json', JSON.stringify(resultsOneVar));
//     fs.writeFileSync('results_two_var.json', JSON.stringify(resultsTwoVar));
//     fs.writeFileSync('results_three_var.json', JSON.stringify(resultsThreeVar));
//     fs.writeFileSync('results_four_var.json', JSON.stringify(resultsFourVar));
//     fs.writeFileSync('results_five_var.json', JSON.stringify(resultsFiveVar));
//     // fs.writeFileSync('results_five_plus_var.json', JSON.stringify(resultsFivePlusVar));
//     console.log('done');
// }

function getRandomElements(arr_original: string[], n: number): string[] {
    //PLACEHOLDER is not supported right now, ignoring it.
    let arr = arr_original.filter((item) => !item.includes('PLACEHOLDER'));
    if (n > arr_original.length) {
        throw new RangeError(
            'getRandomElements: more elements requested than available'
        );
    }
    let shuffled = arr
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
    return shuffled.slice(0, n);
}

// main();
