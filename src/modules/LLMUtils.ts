import OpenAI from 'openai';
import fs from 'fs';
import * as vscode from 'vscode';

// load the config json
import config from './config.json';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { createExponetialDelay, retryAsync, waitUntilAsync } from 'ts-retry';

// define interface for the config json file

async function retryExponential<T>(
    fn: () => Promise<T>,
    maxTry: number = 10,
    maxTimeout: number = 600000
): Promise<T> {
    const delay = createExponetialDelay(3000);
    return await ((await waitUntilAsync(async () => {
        return await retryAsync(fn, {
            maxTry,
            delay,
            onError: (error: Error) => {
                console.error(`Error on re/try:"${error.message}" Retrying...`);
            },
            onMaxRetryFunc: (error: Error) => {
                {
                    console.error(`Max Retries reached, error:" ${error.message}"`);
                }
            },
        });
    }, maxTimeout)) as Promise<T>);
}

export const GPTModel = {
    GPT3_5Turbo: {
        OpenAI: 'gpt-3.5-turbo',
        Azure: 'gpt-35-turbo',
        Copilot: 'copilot-gpt-3.5-turbo',
    },
    GPT4: { OpenAI: 'gpt-4', Azure: 'gpt-4', Copilot: 'copilot-gpt-4' },
    GPT4_Turbo: {
        OpenAI: 'gpt-4-turbo-preview',
        Azure: 'gpt-4-turbo-preview',
        Copilot: 'copilot-gpt-3.5-turbo',
    },
} as const;

export type GPTModel = (typeof GPTModel)[keyof typeof GPTModel];

interface configJson {
    LLM_Backend: string;
    Endpoint?: string;
    APIKey?: string;
}

export enum Backend {
    'Azure',
    'OpenAI',
    'Copilot',
}

interface Config {
    LLM_Backend: Backend;
    Endpoint?: string;
    APIKey?: string;
}

let configJson: configJson = config;

let configuration: Config = {
    LLM_Backend: Backend[config.LLM_Backend as keyof typeof Backend],
};

export function setBackend(backend: Backend) {
    configuration.LLM_Backend = backend;
    configJson.LLM_Backend = Backend[backend];
    // save the new configuration to the config.json file
    fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function getBackend(): Backend {
    return configuration.LLM_Backend;
}

export function getEndpoint(): string | undefined {
    return configuration.Endpoint;
}
export function getAPIKey(): string | undefined {
    return configuration.APIKey;
}

export function setEndpoint(endpoint: string) {
    configuration.Endpoint = endpoint;
    configJson.Endpoint = endpoint;
    fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function setAPIKey(APIKey: string) {
    configuration.APIKey = APIKey;
    configJson.APIKey = APIKey;
    fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function getClient() {
    if (configuration.LLM_Backend === Backend.Azure) {
        return getAzureClient();
    } else if (configuration.LLM_Backend === Backend.OpenAI) {
        return getOpenAIClient();
    } else if (configuration.LLM_Backend === Backend.Copilot) {
        return vscode.lm;
    }
}

function getAzureClient(): OpenAI | undefined {
    let endpoint: string | undefined;
    let credential: string | undefined;
    if (process.env.AZURE_OPENAI_ENDPOINT) {
        endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    } else {
        if (getEndpoint()) {
            endpoint = getEndpoint();
        } else {
            console.error('No endpoint provided in Environment or config.json');
            return;
        }
    }
    if (process.env.AZURE_OPENAI_API_KEY) {
        credential = process.env.AZURE_OPENAI_API_KEY;
    } else {
        if (getAPIKey()) {
            credential = getAPIKey();
        } else {
            console.error('No API Key provided in Environment or config.json');
            return;
        }
    }
    let client = new OpenAI({
        apiKey: credential,
        baseURL: endpoint + 'openai/deployments/gpt-35-turbo',
        defaultQuery: { 'api-version': '2023-05-15' },
        defaultHeaders: { 'api-key': credential },
    });
    return client;
}

function getOpenAIClient(): OpenAI {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? getAPIKey() });
}

export async function sendChatRequest(
    organizedMessages: ChatCompletionMessageParam[],
    LLMOptions?: { [name: string]: any },
    cancellationToken?: vscode.CancellationToken,
    cleanJsonOutput?: boolean,
    addFailureMessage?: boolean
): Promise<string> {
    let client = getClient();
    if (client === undefined || client === null) {
        console.error('Client is undefined');
        return '{"error": "Issue during LLM Backend configuration"}';
    }

    const filteredOptions: [string, any][] = LLMOptions
        ? Object.entries(LLMOptions).filter(([key, value]) => {
            return key !== 'model' && key !== 'temperature' && key !== 'seed';
        })
        : [];
    const otherOptions: Record<string, any> =
        Object.fromEntries(filteredOptions);

    if (addFailureMessage) {
        organizedMessages.push({
            role: 'user',
            content:
                'If you encounter any problems fulfilling this request, please start your response with " I am sorry "',
        });
    }

    // if backend is Azure or OpenAI
    if (client instanceof OpenAI) {
        const response = await retryExponential(async () => {
            if (client && client instanceof OpenAI) {
                return await
                    client.chat.completions.create({
                        messages: organizedMessages,
                        model: LLMOptions?.model[config.LLM_Backend],
                        temperature: (LLMOptions?.temperature as number) ?? 0.3,
                        seed: (LLMOptions?.seed as number) ?? 42,
                        // transform remaining LLMOptions into parameter value pairs
                        ...otherOptions,
                    });
            }
        });
        // if (getDirectResponse) {
        //     return response;
        // }
        let result = null;
        if (response) { result = response.choices?.[0]?.message?.content; }
        if (result !== null) {
            if (result.startsWith('I am sorry')) {
                // console.error(
                // 'LLM failed to generate an appropriate response, and I am sorry was returned'
                // );
                return (
                    '{"error": "LLM failed to generate a response, an I am sorry message was returned", "error_message": "' +
                    result +
                    '"}'
                );
            }
            if (cleanJsonOutput) {
                // resolve issue with trailing output 
                // find last occurrence of } in result string
                let last_occurrence = result.lastIndexOf('}');
                // remove everything after the last occurrence
                result = result.substring(
                    0,
                    last_occurrence + 1);
            }
            return result;
        } else {
            console.error('No response from LLM');
            return (
                '{"error": "No response from"' +
                configuration.LLM_Backend +
                ' "LLM"}'
            );
        }


    } else {
        let convertedMessages: vscode.LanguageModelChatMessage[] = [];
        organizedMessages.forEach((message) => {
            if (message.role === 'system') {
                convertedMessages.push(
                    new vscode.LanguageModelChatSystemMessage(message.content)
                );
            } else if (message.role === 'user') {
                convertedMessages.push(
                    new vscode.LanguageModelChatUserMessage(
                        message.content as string
                    )
                );
            } else if (message.role === 'assistant') {
                convertedMessages.push(
                    new vscode.LanguageModelChatAssistantMessage(
                        message.content as string
                    )
                );
            } else {
                console.error('Invalid message role - skipping message');
            }
        });

        if (LLMOptions?.model === GPTModel.GPT4_Turbo) {
            // TODO: Does this not exist?
            // model = 'copilot-gpt-4-turbo';
            console.warn(
                'Copilot GPT4Turbo does not exist. Using GPT3.5 turbo instead.'
            );
        }

        const copyOfLLMOptions = { ...LLMOptions };
        delete copyOfLLMOptions.model;
        const result = await retryExponential(async () => {
            if (client && 'sendChatRequest' in client) {
                return await client.sendChatRequest(
                    LLMOptions?.model.Copilot ?? 'copilot-gpt-3.5-turbo',
                    convertedMessages,
                    {
                        modelOptions: copyOfLLMOptions,
                    },
                    cancellationToken || new vscode.CancellationTokenSource().token
                );
            }
        });
        let completeResult = '';
        if (result !== null && result !== undefined) {
            for await (const fragment of result.stream) {
                completeResult += fragment;
            }
        }
        if (completeResult !== '') {
            if (completeResult.startsWith('I am sorry')) {
                console.error(
                    'LLM failed to generate an appropriate response, and I am sorry was returned'
                );
                return (
                    '{"error": "LLM failed to generate a response, an I am sorry message was returned", "error_message": "' +
                    completeResult +
                    '"}'
                );
            }
            return completeResult;
        } else {
            console.error('No response from LLM');
            return (
                '{"error": "No response from"' +
                configuration.LLM_Backend +
                ' "LLM"}'
            );
        }
    }
}
// TODO - Add more utility functions here
