import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import * as utils from '../utils.js';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as vscode from 'vscode';
import { PromptMetadata, PromptTemplateHole } from './index.js';
import * as fs from 'fs';
import HoleFillingPromptJson from './hole-filling-prompt.json';

export async function patchValue(
    prompt: PromptMetadata,
    templateValue: PromptTemplateHole
): Promise<JSONSchemaObject> {
    let userPromptToSend = HoleFillingPromptJson.user_prompt;
    let systemPromptToSend = HoleFillingPromptJson.system_prompt;
    let promptWithHoles = prompt.normalizedText;
    userPromptToSend = userPromptToSend.replace(
        '{' + HoleFillingPromptJson.injected_variables[0] + '}',
        promptWithHoles
    );
    let variableName = templateValue.name;
    userPromptToSend = userPromptToSend.replace(
        '{' + HoleFillingPromptJson.injected_variables[1] + '}',
        variableName
    );
    // load source code file contents from file
    const sourceCodeFileContents = fs.readFileSync(
        prompt.sourceFilePath,
        'utf8'
    );

    // inject source code file contents into the prompt
    userPromptToSend = userPromptToSend.replace(
        '{' + HoleFillingPromptJson.injected_variables[2] + '}',
        sourceCodeFileContents
    );
    // look for read me file in the same directory , or the repository root
    let readmeFilePath = findReadmeFile(prompt.sourceFilePath);
    let readmeFileContents = '';
    if (readmeFilePath) {
        readmeFileContents = await fs.promises.readFile(readmeFilePath, 'utf8');
        // inject readme file contents into the prompt
        userPromptToSend +=
            'You may use the following README.md file contents to help you fill in the holes:\n' +
            readmeFileContents;
    }
    const deploymentId = 'gpt-35-turbo';
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPromptToSend },
        { role: 'user', content: userPromptToSend },
    ];
    let client = utils.getClient();
    // console.log(client);
    if (client === undefined) {
        console.error('Client is undefined');
        return JSON.parse('{"error": " Issue during OpenAI configuration"}');
    } else {
        const response = await client.chat.completions
            .create({
                messages: messages,
                model: deploymentId,
                temperature: 0.3,
                seed: 42,
            })
            .then((response) => {
                return response;
            })
            .catch((error) => {
                console.error('Error during hole plugging:', error);
                return JSON.parse(
                    '{"error": " Issue during OpenAI completion"}'
                );
            });
        const result = response.choices?.[0]?.message?.content;
        console.log(result);
        // convert result to json and return
        if (result !== undefined && result !== null) {
            const result_json = JSON.parse(result);
            return result_json;
        } else {
            return JSON.parse('{"error": "No response from Azure OpenAI}"');
        }
    }
}

function findReadmeFile(sourceFilePath: string): string | undefined {
    // look for read me file in the same directory , or the repository root
    let readmeFilePath =
        sourceFilePath.split('/').slice(0, -1).join('/') + '/README.md';
    if (fs.existsSync(readmeFilePath)) {
        return readmeFilePath;
    } else {
        for (let workspaceFolder of vscode.workspace.workspaceFolders?.values() ||
            []) {
            let rootPath = workspaceFolder.uri.fsPath;
            if (rootPath) {
                // check if readme file exists in the root path
                readmeFilePath = rootPath + '/README.md';
                if (fs.existsSync(readmeFilePath)) {
                    return readmeFilePath;
                }
                // find the list of directories in the root path
                let directories = fs.readdirSync(rootPath, {
                    withFileTypes: true,
                });
                for (let directory of directories) {
                    if (directory.isDirectory()) {
                        // check if readme file exists in the directory
                        const returnValue: string | undefined = findReadmeFile(
                            rootPath + '/' + directory.name
                        );
                        if (returnValue) {
                            return returnValue;
                        }
                    }
                }
            }
        }
    }
    return undefined;
}
