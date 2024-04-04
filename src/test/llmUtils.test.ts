// few basic tests to verify  LLmUtils class is working as expected

import * as assert from 'assert';
import * as vscode from 'vscode';

import * as LLMUtils from '../modules/utils';
import { Backend } from '../modules/utils';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import OpenAI from 'openai';

const extensionUri = __dirname.split('\\').slice(0, -2).join('/');
suite('LLMUtils Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    // install github copilot extension to vs code
    vscode.extensions.getExtension('github.copilot')?.activate();
    // install github copilot chat extension to vs code
    vscode.extensions.getExtension('github.copilot-chat')?.activate();
    // wait for the extension to activate
    vscode.window.showInformationMessage('Waiting for extension to activate.');

    test('change Backend Test ', () => {
        LLMUtils.setBackend(Backend.Azure);
        assert.strictEqual(LLMUtils.getBackend(), Backend.Azure);
        LLMUtils.setBackend(Backend.Copilot);
        assert.strictEqual(LLMUtils.getBackend(), Backend.Copilot);
    });

    test('Azure Backend Configuration Test ', () => {
        LLMUtils.setBackend(Backend.Azure);
        assert.ok(LLMUtils.getClient() instanceof OpenAI);
    });

    test('Azure Backend-powered Client Test ', async () => {
        LLMUtils.setBackend(Backend.Azure);

        let messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content:
                    'You are a helpful assistant that repeats exactly what the user says.',
            },
            {
                role: 'user',
                content: 'Hello',
            },
            {
                role: 'system',
                content: 'Hello',
            },
            {
                role: 'user',
                content: 'Hi',
            },
        ];
        const response = await LLMUtils.sendChatRequest(messages);
        assert.ok(response !== undefined);
        console.log(response);
        assert.ok(response === 'Hi');
    });

    test('Copilot Backend-powered Client Test ', async () => {
        LLMUtils.setBackend(Backend.Copilot);
        let messages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content:
                    'You are a helpful assistant that repeats exactly what the user says.',
            },
            {
                role: 'user',
                content: 'Repeat after me: Hello',
            },
            {
                role: 'system',
                content: 'Hello',
            },
            {
                role: 'user',
                content: 'Hi',
            },
        ];
        const response = await LLMUtils.sendChatRequest(messages);
        assert.ok(response !== undefined);
        console.log(response);
        assert.ok(response.startsWith('Hi') || response.startsWith('Hello'));
    });
});
