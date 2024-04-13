import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import * as utils from '../LLMUtils.js';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as vscode from 'vscode';
import { PromptMetadata, PromptTemplateHole } from './index.js';
import * as fs from 'fs';
import HoleFillingPromptJson from './hole-patching-prompt.json';
import path from 'path';

const modelType = utils.GPTModel.GPT3_5Turbo;

export async function patchHoles(
    promptObject: PromptMetadata,
    forceRepatch: boolean = false
) {
    for (let key in promptObject.templateValues) {
        if (!promptObject.templateValues[key].defaultValue || forceRepatch) {
            let fillValue = await _patchValue(
                promptObject,
                promptObject.templateValues[key]
            );
            if (fillValue.error) {
                return;
            }
            promptObject.templateValues[key].defaultValue = fillValue.value;
        }
    }
}

async function _patchValue(
    prompt: PromptMetadata,
    templateValue: PromptTemplateHole
): Promise<JSONSchemaObject> {
    let userPromptToSend = HoleFillingPromptJson.user_prompt;
    let systemPromptToSend = HoleFillingPromptJson.system_prompt;
    let promptWithHoles = prompt.normalizedText;
    // fill in the holes in the prompt where default values are ready : this should make the default values more consistent with each other
    for (let key in prompt.templateValues) {
        let value = prompt.templateValues[key].defaultValue;
        if (value) {
            promptWithHoles = promptWithHoles.replace('{{' + key + '}}', value);
        }
    }
    userPromptToSend = userPromptToSend.replace(
        '{{' + HoleFillingPromptJson.injected_variables[0] + '}}',
        promptWithHoles
    );
    let variableName = templateValue.name;
    userPromptToSend = userPromptToSend.replace(
        '{{' + HoleFillingPromptJson.injected_variables[1] + '}}',
        variableName
    );
    // load source code file contents from file
    // convert the source code file path to a  uri
    const sourceCodeFilePath = vscode.Uri.file(prompt.sourceFilePath);
    const sourceCodeFileContents = fs.readFileSync(
        sourceCodeFilePath.fsPath,
        'utf8'
    );

    // inject source code file contents into the prompt
    userPromptToSend = userPromptToSend.replace(
        '{{' + HoleFillingPromptJson.injected_variables[2] + '}}',
        sourceCodeFileContents
    );
    // look for read me file in the same directory , or the repository root
    let readmeFilePath = findReadmeFile(prompt.sourceFilePath);
    let readmeFileContents = '';
    if (readmeFilePath) {
        const readmeFilePathURI = vscode.Uri.file(readmeFilePath);
        readmeFileContents = await fs.promises.readFile(
            readmeFilePathURI.fsPath,
            'utf8'
        );
        // inject readme file contents into the prompt
        userPromptToSend +=
            '\n You may use the following README.md file contents to help you better understand the context of this prompt: "\n' +
            readmeFileContents +
            '"';
    }

    // const deploymentId = 'gpt-35-turbo';
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
        try {
            const result = await utils.sendChatRequest(
                messages,
                {
                    model: modelType,
                    temperature: 0.3,
                    seed: 42,
                    // type: "json_object" // force answer to be valid json ==> NOT SUPPORTED BY AZURE
                },
                undefined,
                true,
                true
            );
            // convert result to json and return
            if (result !== undefined && result !== null) {
                try {
                    const result_json = JSON.parse(result);
                    return result_json;
                } catch (error) {
                    return JSON.parse(
                        '{"error": "Issue during LLM completion: Invalid JSON"}'
                    );
                }
            } else {
                return JSON.parse('{"error": "No response from LLM"}');
            }
        } catch (error) {
            console.error('Error during LLM completion:', error);
            return JSON.parse(
                '{"error": "Issue during LLM completion", "error_message": "' +
                    error +
                    '"}'
            );
        }
        return JSON.parse('{"error": "Issue during LLM completion"}');
    }
}

function findReadmeFile(sourceFilePath: string): string | undefined {
    // look for read me file in the same directory , or the repository root
    const filePath = path.dirname(sourceFilePath);
    let readmeFilePath = path.join(filePath, 'README.md');
    if (fs.existsSync(readmeFilePath)) {
        return readmeFilePath;
    } else {
        for (let workspaceFolder of vscode.workspace.workspaceFolders?.values() ||
            []) {
            let rootPath = workspaceFolder.uri.fsPath;
            if (rootPath) {
                // check if readme file exists in the root path
                readmeFilePath = path.join(rootPath, 'README.md');
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
                            path.join(rootPath, directory.name)
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
