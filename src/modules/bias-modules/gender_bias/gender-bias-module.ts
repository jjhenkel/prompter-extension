
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import * as utils from "../../utils.js";
import { JSONSchemaObject } from "openai/lib/jsonschema.mjs";
import * as vscode from 'vscode';

import  PromptJson from './gender_prompt_4.json';

async function checkGenderBias(input_text: string): Promise<JSONSchemaObject> {
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

//alternative implementation using vscode language models 
export async function checkGenderBiasWithLlmAPI(input_text:string, token: vscode.CancellationToken): Promise<JSONSchemaObject> {
     // load prompt from json file 
    // extract prompt from json file
    const userPromptText: string = PromptJson.user_prompt;
    const systemPromptText: string = PromptJson.system_prompt;
    // inject text variables into prompt 
    const variables_to_inject = PromptJson.injected_variables;
    let userPrompt = userPromptText;
    for (const variable in variables_to_inject) {
        let value = "{" + variables_to_inject[variable] + "}";
        userPrompt = userPrompt.replace(value, input_text);
    }
    const LANGUAGE_MODEL_ID = 'copilot-gpt-3.5-turbo';
    // const LANGUAGE_MODEL_ID = 'copilot-gpt-4';
    const access = await vscode.lm.requestLanguageModelAccess(LANGUAGE_MODEL_ID);
    const messages = [
        new vscode.LanguageModelSystemMessage(systemPromptText),
        new vscode.LanguageModelUserMessage(userPrompt)
    ];
    const chatRequest = access.makeChatRequest(messages, {}, token);
    
    // collect the response from the chatRequest
    var response:string = "";
    for await (const fragment of chatRequest.stream) {
        response+=fragment;
    }
    const result = response;
        // console.log(result);
        // convert result to json and return
    if (result !== undefined && result !== null) {
        const result_json = JSON.parse(result as string);
        return result_json;
    } else {
        return JSON.parse("{\"error\": \"No response from Copilot\"}");
    }
    
}

export default checkGenderBias;

