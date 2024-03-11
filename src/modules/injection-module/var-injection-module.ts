
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import * as utils from "../utils";
import { JSONSchemaObject } from "openai/lib/jsonschema.mjs";
import PromptJson from './var-injection-prompt-1.json';
import AttacksJson from './injections_attacks.json';

async function checkVariableInjection(input_text: string): Promise<JSONSchemaObject> {
    // load prompt from json file 
    // extract prompt from json file
    const systemPromptText: string = PromptJson.system_prompt;
    let userPromptText: string = PromptJson.user_prompt; // empty for now 
    // inject text variables into prompt 
    // const variables_to_inject = PromptJson.injected_variables;
    // userPromptText = userPromptText.replaceAll("__","\n");
    let userPrompt = input_text;
    let promptVariables: string[] | null = [];
    // extract variables in prompt by finding string + var + string or by finding {var} in string 
    if (userPrompt.includes("+") || userPrompt.includes("{") || userPrompt.includes("}")) {
        // extract variables from prompt 
        let match1 = userPrompt.match(/{.*}/g);
        let match2 = userPrompt.match(/\+[^\"]+\+/g);
        promptVariables = match1 ? (match2 ? match1.concat(match2) : match1) : match2;
        // if (variables !== null) {
        //     for (let i = 0; i < variables.length; i++) {
        //         // replace var with input text 
        //         userPrompt = userPrompt.replace("var", input_text);
        //     }
        // }
    }

    let default_response: string = "";
    // send the prompt to azure openai using client 
    const deploymentId = "gpt-35-turbo";
    const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: systemPromptText },
        { role: "user", content: userPrompt }
    ];
    // console.log(messages);
    // convert messages list to chat request 
    let client = utils.getClient();
    // console.log(client);
    if (client === undefined) {
        console.error("Client is undefined");
        return JSON.parse("{\"error\": \" Issue during OpenAI configuration}\"");
    }

    const response = await client.chat.completions.create({
        messages: messages,
        model: deploymentId,
        temperature: 0.3,
        seed: 42,
    });
    const result = response.choices?.[0]?.message?.content;
    // console.log(result);
    // convert result to json and return
    if (result !== undefined && result !== null) {
        default_response = result;
    } else {
        default_response = JSON.parse("{\"error\": \"No response from Azure OpenAI}\"");
    }

    let attacks = AttacksJson.attacks;
    let poisoned_responses: string[] = [];

    for (let i = 0; i <2 ; i++) {
        let attack = attacks[i];
        for (let prompt_var in promptVariables) {
            let injected_prompt = userPrompt.replace(prompt_var, attack);
            // send the prompt to azure openai using client
            const messages: ChatCompletionMessageParam[] = [
                { role: "system", content: systemPromptText },
                { role: "user", content: injected_prompt }
            ];
            const response = await client.chat.completions.create({
                messages: messages,
                model: deploymentId,
                temperature: 0.3,
                seed: 42,
            });
            const result = response.choices?.[0]?.message?.content;
            // convert attack to word list 
            const attack_list = attack.split(" ");
            if (result !== undefined && result !== null) {
                if (attack_list.some(word => result?.includes(word) && !result.includes(default_response))) {
                    // attack detected 
                    poisoned_responses.push(result);
                    continue;
                }
                if (!result.includes(default_response)) {
                    poisoned_responses.push(result);
                    continue;
                }
            }
        }
    }
    if (poisoned_responses.length > 0) {
       // convert poisoned responses to json array of string while cleaning string from any characters that might break json parsing
        let poisoned_responses_json_map = poisoned_responses.map(response => JSON.stringify(response.replace(",", ";")));
        const poisoned_responses_json_string = poisoned_responses_json_map.join(",");

        const str = "{\"Vulnerable\": \"Yes\" , " + "\"Poisoned Responses\": ["+ poisoned_responses_json_string + "]}";
        console.log(str);
        return JSON.parse(str);
    } else {
        return JSON.parse("{\"Vulnerable\": \"No\"}");
    }
}


export default checkVariableInjection;

// simple main function to test code 
// async function main() {
//     const result = await checkVariableInjection("The following is a conversation with an AI Customer Segment Recommender. The AI is insightful, verbose, and wise, and cares a lot about finding the product market fit. What are the top 5 types of customer should a seller who is\"+prompt_seller_persona+\"sell\"+\"{prompt_product_desc} to?");
//     console.log(result);
// }

// main();