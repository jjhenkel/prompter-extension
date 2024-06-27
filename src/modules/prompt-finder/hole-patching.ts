import { ChatCompletionMessageParam } from 'openai/resources';
import * as utils from '../LLMUtils';
import * as PromptUtils from '../PromptUtils';
// import * as vscode from 'vscode';
import { PromptMetadata, PromptTemplateHole } from './index';
// import HoleFillingPromptJson from './hole-patching-prompt.json';
import path from 'path';

const modelType = utils.GPTModel.GPT3_5Turbo;

export type patchedVariable = {
    name: string;
    value: string;
    error?: string;
};

export async function patchHoles(
    promptObject: PromptMetadata,
    forceRepatch: boolean = false,
    useSystemPrompt: boolean = true
) {
    for (let key in promptObject.templateValues) {
        if (!promptObject.templateValues[key].defaultValue || forceRepatch) {
            let fillValue = await _patchValue(
                promptObject,
                promptObject.templateValues[key],
                useSystemPrompt
            );
            if (fillValue.error) {
                return;
            }
            promptObject.templateValues[key].defaultValue = fillValue.value;
        }
    }
}

export function unpatchHoles(
    newPromptString: string,
    promptObject: PromptMetadata
): [string, string[]] {
    let unmatchedKeys = [];
    for (let key in promptObject.templateValues) {
        let value = promptObject.templateValues[key].defaultValue;
        if (value && newPromptString.includes(value)) {
            newPromptString = newPromptString.replace(value, '{{' + key + '}}');
        } else {
            console.log('Error: Could not find value to unpatch');
            unmatchedKeys.push(key);
        }
    }
    return [newPromptString, unmatchedKeys];
}

async function _patchValue(
    prompt: PromptMetadata,
    templateValue: PromptTemplateHole,
    useSystemPrompt: boolean
): Promise<patchedVariable> {
    // load prompt from yaml file
    let serializedPrompts = PromptUtils.loadPromptsFromYaml(
        path.resolve(__dirname, 'hole-patching-prompt.yaml')
    );

    let userPromptToSendObject = PromptUtils.getPromptsOfRole(
        serializedPrompts,
        'user'
    )[0];
    let userPromptToSend = userPromptToSendObject.content;
    let systemPromptToSend = PromptUtils.getPromptsOfRole(
        serializedPrompts,
        'system'
    )[0].content;
    let promptWithHoles = prompt.normalizedText;
    // fill in the holes in the prompt where default values are ready : this should make the default values more consistent with each other
    for (let key in prompt.templateValues) {
        let value = prompt.templateValues[key].defaultValue;
        if (value) {
            promptWithHoles = promptWithHoles.replace('{{' + key + '}}', value);
        }
    }
    if (userPromptToSendObject.injectedVariables === undefined) {
        console.log('Error: Injected variables not found in prompt');
        return {
            name: templateValue.name,
            value: '',
            error: 'Injected variables not found in prompt',
        };
    }
    userPromptToSend = userPromptToSend.replace(
        '{{' + userPromptToSendObject.injectedVariables[0] + '}}',
        promptWithHoles
    );
    let variableName = templateValue.name;
    userPromptToSend = userPromptToSend.replace(
        '{{' + userPromptToSendObject.injectedVariables[1] + '}}',
        variableName
    );
    // load source code file contents from file
    // convert the source code file path to a  uri
    // const sourceCodeFilePath = vscode.Uri.file(prompt.sourceFilePath);
    const sourceCodeFileContents = '';
    // fs.readFileSync(
    //     sourceCodeFilePath.fsPath,
    //     'utf8'
    // );

    // inject source code file contents into the prompt
    let tempUserPromptToSend = userPromptToSend.replace(
        '{{' + userPromptToSendObject.injectedVariables[2] + '}}',
        sourceCodeFileContents
    );
    //TODO add support for different lengths depending on LLM used
    if (
        !(await utils.isPromptShortEnoughForModel(
            tempUserPromptToSend,
            modelType
        ))
    ) {
        // parse the source code file to get the global variables
        console.log(
            'Source code file too large for LLM, sending only the direct containing function'
        );
        let sourceCodeToInject = '';
        if (prompt.promptNode !== undefined) {
            let scopePrompt = prompt.promptNode;
            while (
                scopePrompt.type !== 'function' &&
                scopePrompt.parent !== undefined &&
                scopePrompt.parent !== null
            ) {
                scopePrompt = scopePrompt.parent;
            }
            sourceCodeToInject = scopePrompt.text;
        } else {
            sourceCodeToInject = prompt.rawTextOfParentCall;
        }
        tempUserPromptToSend = tempUserPromptToSend.replace(
            '{{' + userPromptToSendObject.injectedVariables[2] + '}}',
            sourceCodeToInject
        );
        if (
            !(await utils.isPromptShortEnoughForModel(
                tempUserPromptToSend,
                modelType
            ))
        ) {
            console.log(
                `Source code file too large for LLM, sending only the first ${utils.getMaxTokenLength(modelType)} of tokens`
            );
            tempUserPromptToSend = await utils.slicePromptForModel(
                tempUserPromptToSend,
                modelType
            );
        }
    }
    userPromptToSend = tempUserPromptToSend;
    // add the system prompt and corresponding command if available
    if (useSystemPrompt && prompt.selectedSystemPromptText !== undefined) {
        const systemPromptCmd =
            ' .\n To better inform your guess, you should use the following system prompt for guidance context: \n ' +
            prompt.selectedSystemPromptText;
        userPromptToSend = userPromptToSend.replace(
            '{{' + userPromptToSendObject.injectedVariables[3] + '}}',
            systemPromptCmd
        );
    } else {
        userPromptToSend = userPromptToSend.replace(
            '{{' + userPromptToSendObject.injectedVariables[3] + '}}',
            ''
        );
    }
    // look for read me file in the same directory , or the repository root
    // let readmeFilePath = findReadmeFile(prompt.sourceFilePath);
    let readmeFileContents = '';
    tempUserPromptToSend = userPromptToSend;
    // if (readmeFilePath) {
    //     const readmeFilePathURI = vscode.Uri.file(readmeFilePath);
    //     readmeFileContents = await fs.promises.readFile(
    //         readmeFilePathURI.fsPath,
    //         'utf8'
    //     );
    //     // inject readme file contents into the prompt
    //     tempUserPromptToSend +=
    //         '\n You may use the following README.md file contents to help you better understand the context of this prompt: \n `' +
    //         readmeFileContents +
    //         '`';
    // }
    if (
        !(await utils.isPromptShortEnoughForModel(
            tempUserPromptToSend,
            modelType
        ))
    ) {
        console.log(
            `Prompt too large for LLM, sending only the first ${utils.getMaxTokenLength(modelType)} of tokens`
        );
        tempUserPromptToSend = await utils.slicePromptForModel(
            tempUserPromptToSend,
            modelType
        );
    }
    userPromptToSend = tempUserPromptToSend;

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
                false
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
    }
}

// function findReadmeFile(sourceFilePath: string): string | undefined {
//     // look for read me file in the same directory , or the repository root
//     const filePath = path.dirname(sourceFilePath);
//     let readmeFilePath = path.join(filePath, 'README.md');
//     if (fs.existsSync(readmeFilePath)) {
//         return readmeFilePath;
//     } else {
//         for (let workspaceFolder of vscode.workspace.workspaceFolders?.values() ||
//             []) {
//             let rootPath = workspaceFolder.uri.fsPath;
//             if (rootPath) {
//                 // check if readme file exists in the root path
//                 readmeFilePath = path.join(rootPath, 'README.md');
//                 if (fs.existsSync(readmeFilePath)) {
//                     return readmeFilePath;
//                 }
//                 // find the list of directories in the root path
//                 let directories = fs.readdirSync(rootPath, {
//                     withFileTypes: true,
//                 });
//                 for (let directory of directories) {
//                     if (directory.isDirectory()) {
//                         // check if readme file exists in the directory
//                         const returnValue: string | undefined = findReadmeFile(
//                             path.join(rootPath, directory.name)
//                         );
//                         if (returnValue) {
//                             return returnValue;
//                         }
//                     }
//                 }
//             }
//         }
//     }
//     return undefined;
// }
