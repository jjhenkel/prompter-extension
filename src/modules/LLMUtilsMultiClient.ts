import OpenAI, { OpenAIError, RateLimitError } from 'openai';
// import * as vscode from 'vscode';
import prettier from 'prettier';
// load the config json
import config from './config.json';
// import { ChatCompletionMessageParam } from './types';
import { createExponetialDelay, retryAsync, waitUntilAsync } from 'ts-retry';
import { OpenAIClient, ChatCompletions } from '@azure/openai';

// import { options } from 'axios';
import { AzureCliCredential } from '@azure/identity';
import { ChatCompletionMessageParam } from 'openai/resources';

let getEncoding: any;
async function loadTikTokenModule() {
    const tiktokenModule = await import('js-tiktoken');
    getEncoding = tiktokenModule.getEncoding;
}
loadTikTokenModule();

// define interface for the config json file

async function retryExponential<T>(
    fn: () => Promise<T>,
    maxTry: number = 10,
    maxTimeout: number = 36000000
): Promise<T> {
    const delay = createExponetialDelay(60000);
    return await ((await waitUntilAsync(async () => {
        return await retryAsync(fn, {
            maxTry,
            delay,
            onError: (error: Error) => {
                console.error(`Error on re/try:"${error.message}" Retrying...`);
            },
            onMaxRetryFunc: (error: Error) => {
                {
                    console.error(
                        `Max Retries reached, error:" ${error.message}"`
                    );
                }
            },
        });
    }, maxTimeout)) as Promise<T>);
}

export const GPTModel = {
    GPT3_5Turbo: {
        OpenAI: { ID: 'gpt-3.5-turbo', token_limit: 4096 },
        Azure: { ID: 'gpt-35-turbo', token_limit: 4096 },
        Copilot: { ID: 'copilot-gpt-3.5-turbo', token_limit: 4096 },
    },
    GPT4: {
        OpenAI: { ID: 'gpt-4', token_limit: 4096 },
        Azure: { ID: 'gpt-4', token_limit: 4096 },
        Copilot: { ID: 'copilot-gpt-4', token_limit: 4096 },
    },
    GPT4_Turbo: {
        OpenAI: { ID: 'gpt-4-turbo-preview', token_limit: 4096 },
        Azure: { ID: 'gpt-4-turbo-preview', token_limit: 4096 },
        Copilot: { ID: 'copilot-gpt-3.5-turbo', token_limit: 4096 },
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
if (
    configJson.Endpoint !== undefined &&
    configJson.Endpoint !== '' &&
    configJson.Endpoint !== null
) {
    configuration.Endpoint = configJson.Endpoint;
}

if (
    configJson.APIKey !== undefined &&
    configJson.APIKey !== '' &&
    configJson.APIKey !== null
) {
    configuration.APIKey = configJson.APIKey;
}

export function setBackend(backend: Backend) {
    configuration.LLM_Backend = backend;
    configJson.LLM_Backend = Backend[backend];
    // save the new configuration to the config.json file
    // fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function getBackend(): Backend {
    return configuration.LLM_Backend;
}

export function getBackendName(): string {
    return Backend[configuration.LLM_Backend];
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
    // fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function setAPIKey(APIKey: string) {
    configuration.APIKey = APIKey;
    configJson.APIKey = APIKey;
    // fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 2));
    return config;
}

export function getClient() {
    // return new OpenAI({
    //     baseURL: 'https://localhost:5001',
    //     apiKey: 'dummy',
    // });
    return four_o_clients[currentClientIndex];
    // if (configuration.LLM_Backend === Backend.Azure) {
    //     return getAzureClient();
    // } else if (configuration.LLM_Backend === Backend.OpenAI) {
    //     return getOpenAIClient();
    // } else if (configuration.LLM_Backend === Backend.Copilot) {
    //     return;
    // }
}

function getAzureClient(): OpenAI | undefined {
    let endpoint: string | undefined;
    let credential: string | undefined;
    // if (process.env.AZURE_OPENAI_ENDPOINT) {
    //     endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    // } else {
    //     if (getEndpoint()) {
    //         endpoint = getEndpoint();
    //     } else {
    //         console.error('No endpoint provided in Environment or config.json');
    //         return;
    //     }
    // }
    // if (process.env.AZURE_OPENAI_API_KEY) {
    //     credential = process.env.AZURE_OPENAI_API_KEY;
    // } else {
    //     if (getAPIKey()) {
    //         credential = getAPIKey();
    //     } else {
    //         console.error('No API Key provided in Environment or config.json');
    //         return;
    //     }
    // }
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

const list_of_azure_endpoints = [
    'https://gsl-azoai-1.openai.azure.com/',
    'https://gsl-azoai-2.openai.azure.com/',
    'https://gsl-azoai-3.openai.azure.com/',
    'https://gsl-azoai-4.openai.azure.com/',
    'https://gsl-azoai-8.openai.azure.com/',
    'https://gsl-azoai-9.openai.azure.com/',
];

let maxRetries = 3;

const apiVersion: string = '2024-02-01';

function _initializeClients(endpoints: string[]): OpenAIClient[] {
    const clients: OpenAIClient[] = [];
    endpoints.forEach((endpoint) => {
        try {
            const client = new OpenAIClient(
                endpoint,
                new AzureCliCredential(),
                {
                    apiVersion: apiVersion,
                }
            );

            clients.push(client);
        } catch (e) {
            console.error(
                `Failed to initialize client for endpoint ${endpoint}:`,
                e
            );
        }
    });
    return clients;
}

let four_o_clients = _initializeClients(list_of_azure_endpoints);
let currentClientIndex = 0;

export async function sendChatRequestAndGetDirectResponse(
    organizedMessages: ChatCompletionMessageParam[],
    LLMOptions?: { [name: string]: any },
    cancellationToken?: any
): Promise<string | OpenAI.Chat.ChatCompletion | undefined | ChatCompletions> {
    // let client = getClient();
    // if (client === undefined || client === null) {
    //     console.error('Client is undefined');
    //     return '{"error": "Issue during LLM Backend configuration"}';
    // }

    const filteredOptions: [string, any][] = LLMOptions
        ? Object.entries(LLMOptions).filter(([key, value]) => {
              return key !== 'model' && key !== 'temperature' && key !== 'seed';
          })
        : [];
    const otherOptions: Record<string, any> =
        Object.fromEntries(filteredOptions);

    // if backend is Azure or OpenAI
    // console.log(organizedMessages[1].content);
    // if (client instanceof OpenAI) {
    //     const response = await retryExponential(async () => {
    //         if (client && client instanceof OpenAI) {
    //             return await client.chat.completions.create({
    //                 messages: organizedMessages,
    //                 model: LLMOptions?.model[config.LLM_Backend].ID,
    //                 temperature: (LLMOptions?.temperature as number) ?? 0.3,
    //                 seed: (LLMOptions?.seed as number) ?? 42,
    //                 // transform remaining LLMOptions into parameter value pairs
    //                 ...otherOptions,
    //             });
    //         }
    //     });
    //     return response;
    // }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        for (const _ of four_o_clients) {
            const client = four_o_clients[currentClientIndex];
            try {
                return await client.getChatCompletions(
                    'gpt-4o',
                    organizedMessages,
                    {
                        temperature: 0.0,
                    }
                );
            } catch (e) {
                if (e instanceof RateLimitError || e instanceof OpenAIError) {
                    _handleException(e, attempt);
                    break;
                } else {
                    _handleGeneralException(e, attempt);
                    break;
                }
            }
        }
    }
}

function _handleException(e: Error, attempt: number): void {
    // history.push({ exception: e, endpoint: this.currentEndpoint() });
    _switchClient();
    setTimeout(() => {}, _calculateBackoffTime(attempt));
}

let backoffFactor = 2;
const BACKOFF_MAX_JITTER = 1000;

function _calculateBackoffTime(attempt: number): number {
    return backoffFactor ** attempt + Math.random() * BACKOFF_MAX_JITTER;
}

function _switchClient(): void {
    currentClientIndex = (currentClientIndex + 1) % four_o_clients.length;
}

function _handleGeneralException(e: any, attempt: number): void {
    if (JSON.stringify(e).includes('429')) {
        _handleException(e, attempt);
    } else {
        // console.error('Unknown Exception:', e);
        //   console.error("Exception History:");
        //   history.forEach((ex, i) => {
        // console.error(`Exception ${i}: ${ex.exception} at endpoint ${ex.endpoint}`);
        //   });
        _handleException(e, attempt);
    }
}

export async function sendChatRequest(
    organizedMessages: ChatCompletionMessageParam[],
    LLMOptions?: { [name: string]: any },
    cancellationToken?: any,
    cleanJsonOutput?: boolean,
    addFailureMessage?: boolean
): Promise<string> {
    // let client = OpenAIClient

    // if (addFailureMessage! === true) {
    //     organizedMessages.push({
    //         role: 'user',
    //         content:
    //             'If you encounter any problems fulfilling this request, please start your response with " I am sorry "',
    //     });
    // }
    let response = await sendChatRequestAndGetDirectResponse(
        organizedMessages,
        LLMOptions,
        cancellationToken
    );

    // if (client instanceof OpenAI) {
    response = response as ChatCompletions;
    let result = null;
    if (response) {
        result = response.choices?.[0]?.message?.content;
    }
    if (result !== null && result !== undefined) {
        if (result.startsWith('I am sorry')) {
            // console.error(
            // 'LLM failed to generate an appropriate response, and I am sorry was returned'
            // );
            return (
                '{"error": "LLM failed to generate a response, an I am sorry message was returned", "error_message":' +
                JSON.stringify(result) +
                '}'
            );
        }
        if (cleanJsonOutput) {
            result = await cleanJson(result);
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
    // } else {
    //     response = response as string;
    //     let completeResult: string = '';
    //     if (response !== null && response !== undefined) {
    //         completeResult = response;
    //     }
    //     if (completeResult !== '') {
    //         if (completeResult.startsWith('I am sorry')) {
    //             console.error(
    //                 'LLM failed to generate an appropriate response, and I am sorry was returned'
    //             );
    //             return (
    //                 '{"error": "LLM failed to generate a response, an I am sorry message was returned", "error_message": ' +
    //                 JSON.stringify(completeResult) +
    //                 '}'
    //             );
    //         }
    //         if (cleanJsonOutput) {
    //             completeResult = await cleanJson(completeResult);
    //         }
    //         return completeResult;
    //     } else {
    //         console.error('No response from LLM');
    //         return (
    //             '{"error": "No response from"' +
    //             configuration.LLM_Backend +
    //             ' "LLM"}'
    //         );
    //     }
    // }
}

export async function cleanJson(result: any): Promise<string> {
    // find the first occurrence of '{'
    let first_occurrence = result.indexOf('{');
    //remove everything before the first occurrence
    result = result.substring(first_occurrence);
    let last_occurrence = result.lastIndexOf('}');
    // remove everything after the last occurrence
    result = result.substring(0, last_occurrence + 1);
    // remove any new lines
    result = result.replace(/(\r\n|\n|\r)/gm, '');
    // format the JSON
    try {
        result = prettier.format(result, { parser: 'json' });
    } catch (e) {
        console.error('Error formatting JSON');
        // console.log(e);
        // console.log(result);
    }
    return result;
}
// TODO - Add more utility functions here

// get number of tokens in prompt to be sent to LLM
export async function getNumberOfTokens(prompt: string): Promise<number> {
    // encode the prompt with tiktoken
    await loadTikTokenModule();
    const enc = getEncoding('cl100k_base');
    const encodedPrompt = enc.encode(prompt);
    // return the number of tokens in the prompt
    return encodedPrompt.length;
}
export async function getLeastFrequentToken(
    prompt: string
): Promise<[string, number]> {
    // encode the prompt with tiktoken
    await loadTikTokenModule();
    const enc = getEncoding('cl100k_base');
    const encodedPrompt = enc.encode(prompt);
    // get the least frequent token in the prompt
    let smallest_frequency = encodedPrompt.reduce((a: number, b: number) =>
        a < b ? a : b
    );
    return enc.decode(smallest_frequency), smallest_frequency;
}

export function getMaxTokenLength(model: GPTModel): number {
    let numberOfTokens = 0;
    const backendName = getBackendName();
    if (backendName === 'Azure') {
        return model.Azure.token_limit;
    } else if (backendName === 'OpenAI') {
        return model.OpenAI.token_limit;
    } else if (backendName === 'Copilot') {
        return model.Copilot.token_limit;
    } else {
        console.log('Invalid Backend');
        return 0;
    }
}

export async function isPromptShortEnoughForModel(
    prompt: string,
    model: GPTModel
): Promise<boolean> {
    const numberOfTokens = await getNumberOfTokens(prompt);
    const maxTokenCount = getMaxTokenLength(model);
    return numberOfTokens <= maxTokenCount;
}

export async function slicePromptForModel(
    prompt: string,
    model: GPTModel
): Promise<string> {
    await loadTikTokenModule();
    // encode the prompt with tiktoken
    const enc = getEncoding('cl100k_base');
    const encodedPrompt = enc.encode(prompt);
    const backendName = getBackendName();
    let tokenLimit = getMaxTokenLength(model);
    // slice the prompt to the token limit
    const slicedPrompt = encodedPrompt.slice(0, tokenLimit);
    return enc.decode(slicedPrompt);
}

// test the  sendChatRequest function

// let messages:ChatCompletionMessageParam[] = [
//     {
//         role: 'user',
//         content: 'What is the capital of France?',
//     },
// ];

// let LLMOptions = {
//     model: GPTModel.GPT3_5Turbo,
//     temperature: 0.0,
// };

// sendChatRequest(messages, LLMOptions).then((response) => {
//     console.log(response);
// });
