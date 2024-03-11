
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import * as utils from "../utils";
import { JSONSchemaObject } from "openai/lib/jsonschema.mjs";

import  PromptJson from './var-injection-prompt-1.json';

async function checkVariableInjection(input_text: string): Promise<JSONSchemaObject> {
    // load prompt from json file 
    // extract prompt from json file
    var userPromptText: string = PromptJson.user_prompt;
    const systemPromptText: string = PromptJson.system_prompt;
    // inject text variables into prompt 
    const variables_to_inject = PromptJson.injected_variables;
    userPromptText = userPromptText.replaceAll("__","\n");
    let userPrompt = userPromptText;
    for (const variable in variables_to_inject) {
        let value = "{" + variables_to_inject[variable] + "}";
        userPrompt = userPrompt.replaceAll(value, input_text);
    }
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
    else {
        const response = await client.chat.completions.create({
            messages: messages,
            model: deploymentId,
            temperature: 0.3,
            seed:42,
        });
        const result = response.choices?.[0]?.message?.content;
        // console.log(result);
        // convert result to json and return
        if (result !== undefined && result !== null) {
            const result_json = JSON.parse(result);
            return result_json;
        } else {
            return JSON.parse("{\"error\": \"No response from Azure OpenAI}\"");
        }
    }
}


export default checkVariableInjection;

