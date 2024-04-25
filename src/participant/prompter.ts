import * as vscode from 'vscode';
import { PromptMetadata, findPrompts } from '../modules/prompt-finder';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import suggestImprovement from '../modules/optimize-modules/suggest-by-rules-module';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import { patchHoles } from '../modules/prompt-finder/hole-patching';
import checkVariableInjection from '../modules/injection-module/var-injection-module';
import path from 'path';
import fs from 'fs';
import {
    fixGenderBias,
    fixGenderBiasResult,
} from '../modules/bias-fix-modules/gender-bias-fix-module';

interface IPrompterChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    };
}

//get temporary directory
const tmpDir = require('os').tmpdir();

// Let's use the faster model. Alternative is 'copilot-gpt-4', which is slower but more powerful
const GPT_35_TURBO = 'copilot-gpt-3.5-turbo';
const GPT_4 = 'copilot-gpt-4';
const PROMPT_SAVE_FOR_ANALYSIS = 'prompter.savePrompt';

// A 'participant' is a chat agent that can respond to chat messages
// and interact with the user. Here we define our 'Prompter' participant.
export class PrompterParticipant {
    private static readonly ID = 'prompter';
    private extensionUri: vscode.Uri | undefined;
    private savedPrompt: PromptMetadata | undefined = undefined;
    // private systemPromptIndex: number | undefined = 0;
    private customSystemPrompt: string | undefined = undefined;
    activate(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;

        // Chat participants appear as top-level options in the chat input
        // when you type `@`, and can contribute sub-commands in the chat input
        // that appear when you type `/`.
        // const ref_handler: vscode.ChatRequestHandler = this.handler;
        const prompter = vscode.chat.createChatParticipant(
            PrompterParticipant.ID,
            this.handler.bind(this)
        );

        // Prompter is persistent, whenever a user starts interacting with @prompter, it
        // will be added to the following messages
        // prompter.isSticky = true;

        prompter.iconPath = vscode.Uri.joinPath(
            this.extensionUri,
            'src/logo.jpg'
        );
        // prompter.description = vscode.l10n.t('Let\'s analyze and improve some prompts!');
        // prompter.
        prompter.followupProvider = {
            provideFollowups(
                result: IPrompterChatResult,
                context: vscode.ChatContext,
                token: vscode.CancellationToken
            ) {
                return [
                    {
                        prompt: 'find-prompts',
                        command: 'find-prompts',
                        label: 'Find prompts in your workspace',
                    },
                    {
                        prompt: 'fix-gender-bias',
                        command: 'fix-gender-bias',
                        label: 'Attempt to fix gender bias and bias potential in a prompt',
                    },
                    {
                        prompt: 'analyze-injection-vulnerability',
                        command: 'analyze-injection-vulnerability',
                        label: 'Analyze a prompt for injection vulnerability',
                    },
                    {
                        prompt: 'parse-prompt',
                        command: 'parse-prompt',
                        label: "Parse and show a prompt's internal representation and its associated generated default values",
                    },
                    {
                        prompt: 'select-system-prompt',
                        command: 'select-system-prompt',
                        label: 'Select a system prompt to use for the different analyses on the saved prompt',
                    },
                    {
                        prompt: 'analyze-bias',
                        command: 'analyze-bias',
                        label: 'Analyze bias for a selected prompt',
                    },
                    {
                        prompt: 'suggest-by-rules',
                        command: 'suggest-by-rules',
                        label: 'Suggest a new prompt using rules',
                    },
                    {
                        prompt: 'help',
                        command: 'help',
                        label: 'Get help with using prompter',
                    },
                ];
            },
        };

        // Add the participant to the context's subscriptions
        // context.subscriptions.push(prompter);
        // console.log('Prompter activated');

        // Define context commands
        context.subscriptions.push(
            prompter,
            // Register the command handler for the copy to clipboard command
            vscode.commands.registerCommand(
                PROMPT_SAVE_FOR_ANALYSIS,
                (args: PromptMetadata) => {
                    // const text = args;
                    // copy the prompt to an internal variable
                    this.savedPrompt = args;

                    // show a message to the user
                    vscode.window.showInformationMessage(
                        'Prompt saved for analysis, You can now call other commands to analyze the prompt.'
                    );
                }
            )
        );
        //register command
    }

    // This is the main handler for the participant. It receives a request
    // from the chat and can respond to it using the provided stream.
    async handler(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<IPrompterChatResult> {
        switch (request.command) {
            case 'find-prompts': {
                await this._handleFindPrompts(request, context, stream, token);
                return { metadata: { command: 'find-prompts' } };
            }
            case 'fix-gender-bias': {
                await this._handleFixGenderBiasPrompt(
                    request,
                    context,
                    stream,
                    token
                );
                return { metadata: { command: 'fix-gender-bias' } };
            }
            case 'parse-prompt': {
                await this._handleParsePrompt(request, context, stream, token);
                return { metadata: { command: 'parse-prompt' } };
            }
            case 'select-system-prompt': {
                await this._handleSelectSystemPrompt(
                    request,
                    context,
                    stream,
                    token
                );
                return { metadata: { command: 'select-system-prompt' } };
            }
            case 'analyze-injection-vulnerability': {
                await this._handleInjectionVulnerability(
                    request,
                    context,
                    stream,
                    token
                );
                return { metadata: { command: 'parse-prompt' } };
            }

            case 'help': {
                await this._handleHelp(request, context, stream, token);
                return { metadata: { command: 'help' } };
            }
            case 'analyze-bias': {
                await this._handleAnalyzeBias(request, context, stream, token);
                return { metadata: { command: 'analyze-bias' } };
            }
            case 'suggest-by-rules': {
                await this._handleSuggestByRules(
                    request,
                    context,
                    stream,
                    token
                );
                return { metadata: { command: 'suggest-by-rules' } };
            }
            default: {
                stream.markdown(
                    "Hey, I'm prompter! I can help you find prompts, analyze bias, and more. Try typing `/` to see what I can do."
                );
                return { metadata: { command: '' } };
            }
        }
    }
    async _handleFixGenderBiasPrompt(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(
            'This module will attempt to fix Gender Bias or Bias Potential in the selected prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'It will default to using the text selected in the editor as a prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'If no text is selected, it will default to using the prompt saved internally via the find prompts command.'
        );
        stream.markdown('\n\n');
        // check if text is selected
        const editor = vscode.window.activeTextEditor;
        let tempPrompt: PromptMetadata | undefined;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            if (selectedText) {
                // if selected text is found, analyze it
                stream.markdown(
                    'Analyzing selected text... [This may take a while]'
                );
                stream.markdown('\n\n');
                const startLocation =
                    vscode.window.activeTextEditor?.selection.start;
                const endLocation =
                    vscode.window.activeTextEditor?.selection.end;
                let tempPrompt = await this._findCorrespondingPromptObject(
                    selectedText,
                    startLocation,
                    endLocation
                );
                if (!tempPrompt) {
                    stream.markdown(
                        'No corresponding prompt found in the current file, make sure you select the complete prompt, and that the prompt is saved in the current file, and the file is correctly written.'
                    );
                    return {
                        metadata: {
                            command: 'fix-gender-bias',
                        },
                    };
                }
                const genderFixResults = await fixGenderBias(tempPrompt);
                // Render the results
                stream.markdown('**🎯 Gender Bias Fix Results**:');
                stream.markdown('\n\n');
                this._processGenderBiasFixJSON(genderFixResults, stream);
                return {
                    metadata: { command: 'fix-gender-bias' },
                };
            }
        }
        if (this.savedPrompt) {
            stream.markdown('Analyzing prompt saved for analysis...');

            const genderFixResults = await fixGenderBias(this.savedPrompt!);
            // Render the results
            stream.markdown('**🎯 Gender Bias Fix Results**:');
            stream.markdown('\n\n');
            this._processGenderBiasFixJSON(genderFixResults, stream);
            return { metadata: { command: 'fix-gender-bias' } };
        } else {
            if (editor) {
                stream.markdown(
                    'No prompt found saved and no text selected in active editor'
                );
                return {
                    metadata: { command: 'fix-gender-bias' },
                };
            }
            stream.markdown('No prompt found saved and no active editor');
            return { metadata: { command: 'fix-gender-bias' } };
        }
    }
    _processGenderBiasFixJSON(
        genderFix: JSONSchemaObject | fixGenderBiasResult,
        stream: vscode.ChatResponseStream
    ) {
        if ((genderFix as JSONSchemaObject).error) {
            stream.markdown('Error: ');
            stream.markdown((genderFix as JSONSchemaObject).error as string);
            stream.markdown('\n\n');
            return;
        } else {
            const genderFixRes = genderFix as fixGenderBiasResult;
            // if more than 5 prompts are returned, show only the first 5
            if (genderFixRes.prompts.length > 5) {
                stream.markdown(
                    'More than 5 prompts were generated, showing only the first 5'
                );
                stream.markdown('\n\n');
            }
            stream.markdown('**📝 Fixed Prompts:**');
            stream.markdown('\n\n');
            for (let i = 0; i < 5; i++) {
                stream.markdown(`**Prompt ${i + 1}**:`);
                stream.markdown('\n\n');
                stream.markdown(`${genderFixRes.prompts[i]}`);
                stream.markdown('\n\n');
                // if unresolved Keys are found, show them
                if (genderFixRes.unresolvedKeys.length > 0) {
                    stream.markdown(
                        ' We were unable to re-insert the following keys into the prompt:'
                    );
                    stream.markdown('\n\n');
                    stream.markdown('**📝  Unresolved Keys :**');
                    stream.markdown('\n\n');
                    for (let key in genderFixRes.unresolvedKeys) {
                        stream.markdown(`${key}`);
                        stream.markdown(' ; ');
                    }
                }
            }
        }
    }

    private _handleSelectSystemPrompt(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        if (request.prompt === '') {
            stream.markdown(
                'This module will select the system prompt to use when analyzing the saved prompt via the index passed. The system prompt is used for the different analyses on the saved prompt. If no system prompt is selected, the first system prompt is used by default.'
            );
            stream.markdown('\n\n');
            stream.markdown(
                'Selected System prompt indexes are reset when a new prompt is selected via the Save Prompt button.'
            );
            stream.markdown('\n\n');
            stream.markdown(
                'Custom System Prompt: If you want to use a custom system prompt, pass the text of the custom system prompt as the prompt to this command. The custom system prompt will be used for the different analyses for any prompt ( saved or specified via text-selection).'
            );
            stream.markdown('\n\n');
            stream.markdown(
                ' Custom system prompts take precedence over System prompt selected via index. They are only reset when a "reset" message is send to select-system-prompt.'
            );
            stream.markdown('\n\n');
        }

        // check if prompt is a number
        // convert prompt to number
        const prompt = request.prompt;
        const promptNumber = parseInt(prompt);
        if (isNaN(promptNumber)) {
            if (prompt === 'reset') {
                stream.markdown('Custom System prompt is reset');
                this.customSystemPrompt = undefined;
                if (this.savedPrompt !== undefined) {
                    this.savedPrompt.selectedSystemPromptText =
                        this.savedPrompt.associatedSystemPrompts?.at(0)
                            ?.normalizedText || undefined;
                }
                return { metadata: { command: 'select-system-prompt' } };
            }
            // if prompt is not a number, use it as a system prompt
            stream.markdown('Using the text passed as a system prompt');
            this.customSystemPrompt = prompt;
            if (this.savedPrompt !== undefined) {
                this.savedPrompt.selectedSystemPromptText =
                    this.customSystemPrompt;
            }
        } else {
            // if prompt is a number, use it as an index
            if (
                promptNumber < 1 ||
                (this.savedPrompt?.associatedSystemPrompts !== undefined &&
                    promptNumber >
                        this.savedPrompt?.associatedSystemPrompts?.length + 1)
            ) {
                stream.markdown(
                    'Index out of range, make sure the index is within the range of the system prompts'
                );
                stream.markdown('\n\n');
            } else {
                if (this.savedPrompt !== undefined) {
                    this.savedPrompt.selectedSystemPromptText =
                        this.savedPrompt.associatedSystemPrompts?.at(
                            promptNumber - 1
                        )?.normalizedText || undefined;
                }
            }
        }
        return { metadata: { command: 'select-system-prompt' } };
    }
    private async _handleParsePrompt(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(
            'This module will attempt to parse the selected prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'It will default to using the text selected in the editor as a prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'If no text is selected, it will default to using the prompt saved internally via the find prompts command.'
        );
        stream.markdown('\n\n');
        // check if text is selected
        let tempPrompt: PromptMetadata | undefined = undefined;
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            // get starting vs code position of the selected text
            const startLocation =
                vscode.window.activeTextEditor?.selection.start;
            const endLocation = vscode.window.activeTextEditor?.selection.end;
            if (selectedText) {
                // if selected text is found, analyze it
                stream.markdown(
                    'Parsing selected text and looking for corresponding prompt...'
                );
                stream.markdown('\n\n');
                tempPrompt = await this._findCorrespondingPromptObject(
                    selectedText,
                    startLocation,
                    endLocation
                );
                if (!tempPrompt) {
                    stream.markdown(
                        'No corresponding prompt found in the current file, make sure you select the complete prompt, and that the prompt is saved in the current file, and the file is correctly written.'
                    );
                    stream.markdown('\n\n');
                    stream.markdown(
                        ' Will attempt to parse the saved prompt instead'
                    );
                } else {
                    stream.markdown(
                        'Found corresponding prompt in the current file'
                    );
                    stream.markdown('\n\n');
                }
            }
        }
        if (!tempPrompt && this.savedPrompt) {
            stream.markdown('Parsing saved prompt for analysis...');
            stream.markdown('\n\n');
            tempPrompt = this.savedPrompt;
        }
        stream.markdown(' **📝 Normalized Prompt Text:** ');
        stream.markdown(`${tempPrompt?.normalizedText}`);
        stream.markdown('\n\n');
        // show system prompts if they exist
        if (tempPrompt?.associatedSystemPrompts) {
            if (tempPrompt?.associatedSystemPrompts.length === 1) {
                stream.markdown('**📝  System Prompt:**');
                stream.markdown('\n\n');
                stream.markdown(`${tempPrompt?.associatedSystemPrompts[0]}`);
                stream.markdown('\n\n');
            } else {
                if (this.customSystemPrompt === undefined) {
                    stream.markdown('**📝 Associated System Prompts:**');
                    stream.markdown('\n\n');
                    for (
                        let j = 0;
                        j < tempPrompt?.associatedSystemPrompts.length;
                        j++
                    ) {
                        stream.markdown(
                            `${j + 1} - ${tempPrompt?.associatedSystemPrompts[j].normalizedText}`
                        );
                        stream.markdown('\n\n');
                    }
                    stream.markdown('\n\n');
                    stream.markdown(
                        'By default, the first system prompt is select for the different analyses. To change this, call the set-system-prompt command with the index of the system prompt you want to use. You can also pass a custom system  prompt to the same command.'
                    );
                    stream.markdown('\n\n');
                    if (this.savedPrompt?.selectedSystemPromptText) {
                        stream.markdown(
                            '**📝 System Prompt Currently Selected:**'
                        );
                        stream.markdown('\n\n');
                        stream.markdown(
                            `${tempPrompt?.selectedSystemPromptText}`
                        );
                        stream.markdown('\n\n');
                    }
                } else {
                    if (this.customSystemPrompt !== undefined) {
                        stream.markdown('**📝 Custom System Prompt Defined:**');
                        stream.markdown('\n\n');
                        stream.markdown(`${this.customSystemPrompt}`);
                        stream.markdown('\n\n');
                    }
                }
            }
        }
        if (this.customSystemPrompt !== undefined) {
            stream.markdown('**📝 Custom System Prompt Defined:**');
            stream.markdown('\n\n');
            stream.markdown(`${this.customSystemPrompt}`);
            stream.markdown('\n\n');
        }

        // if some default values in the template values  are undefined or empty, show a message and attempt to fill holes
        if (tempPrompt && Object.keys(tempPrompt.templateValues).length > 0) {
            let hasEmptyValues = false;
            for (let key in tempPrompt?.templateValues) {
                if (!tempPrompt?.templateValues[key].defaultValue) {
                    hasEmptyValues = true;
                    break;
                }
            }
            if (hasEmptyValues) {
                stream.markdown(
                    'Some default values in the template values are empty or undefined, attempting to generate default values...'
                );
                stream.markdown('\n\n');
                await patchHoles(tempPrompt!);
            }
            stream.markdown('**📝 Template Values:**');
            stream.markdown('\n\n');
            for (let key in tempPrompt?.templateValues) {
                let value = tempPrompt?.templateValues[key].defaultValue;
                if (!value) {
                    value = '**No default value was generated**';
                }
                stream.markdown(`**${key}** : `);
                stream.markdown(`${value}`);
                stream.markdown('\n\n');
            }
        }

        return { metadata: { command: 'parse-prompt' } };
    }
    private async _handleInjectionVulnerability(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(
            'This module will attempt to analyze the selected prompts for injection vulnerability.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'It will default to using the text selected in the editor as a prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'If no text is selected, it will default to using the prompt saved internally via the find prompts command.'
        );
        stream.markdown('\n\n');
        // check if text is selected
        const editor = vscode.window.activeTextEditor;
        let tempPrompt: PromptMetadata | undefined;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            if (selectedText) {
                // if selected text is found, analyze it
                stream.markdown(
                    'Analyzing selected text... [This may take a while]'
                );
                stream.markdown('\n\n');
                const startLocation =
                    vscode.window.activeTextEditor?.selection.start;
                const endLocation =
                    vscode.window.activeTextEditor?.selection.end;
                let tempPrompt = await this._findCorrespondingPromptObject(
                    selectedText,
                    startLocation,
                    endLocation
                );
                if (!tempPrompt) {
                    stream.markdown(
                        'No corresponding prompt found in the current file, make sure you select the complete prompt, and that the prompt is saved in the current file, and the file is correctly written.'
                    );
                    return {
                        metadata: {
                            command: 'analyze-injection-vulnerability',
                        },
                    };
                }
                const biasAnalysis = await checkVariableInjection(tempPrompt);
                // Render the results
                stream.markdown(
                    '**🎯 Injection Vulnerability Analysis Results**:'
                );
                stream.markdown('\n\n');
                this._processInjectionVulnerabilityAnalysisJSON(
                    biasAnalysis,
                    stream
                );
                return {
                    metadata: { command: 'analyze-injection-vulnerability' },
                };
            }
        }
        if (this.savedPrompt) {
            stream.markdown('Analyzing prompt saved for analysis...');

            const biasAnalysis = await checkVariableInjection(
                this.savedPrompt!
            );
            // Render the results
            stream.markdown('**🎯 Injection Vulnerability Analysis Results**:');
            stream.markdown('\n\n');
            this._processInjectionVulnerabilityAnalysisJSON(
                biasAnalysis,
                stream
            );
            return { metadata: { command: 'analyze-injection-vulnerability' } };
        } else {
            if (editor) {
                stream.markdown(
                    'No prompt found saved and no text selected in active editor'
                );
                return {
                    metadata: { command: 'analyze-injection-vulnerability' },
                };
            }
            stream.markdown('No prompt found saved and no active editor');
            return { metadata: { command: 'analyze-injection-vulnerability' } };
        }
    }

    private _cleanUpMarkdownString(str: string): string {
        // Find the number of spaces on the second line (first line is just empty)
        const spaces = str.match(/\n(\s*)/);
        if (spaces) {
            const numSpaces = spaces[1].length;
            return str
                .split('\n')
                .map((line) => line.slice(numSpaces))
                .join('\n');
        }

        return str.trim();
    }

    private async _handleHelp(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(
            this._cleanUpMarkdownString(`
            Hey, I'm **prompter**!
            
            I can help you find prompts, analyze bias, and more.
            
            Here are the sub-commands I support:
              - \`/find-prompts\`: Find prompts in your workspace
              - \`/analyze-bias\`: Analyze bias for a selected prompt
              - \`/help\`: Show this help message
        `)
        );
    }

    private async _handleFindPrompts(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        // This shouldn't really happen, just make typescript happy
        if (!this.extensionUri) {
            stream.markdown('Error: Extension URI not found');
            return;
        }

        stream.markdown('**🔎 Searching for prompts** in your workspace...\n');

        // First, we will run a simple regex to find all of the files in the current
        // workspace that have a `.py` extension and include the text `import openai`.
        const files = await vscode.workspace.findFiles('**/*.py');

        // If no files, quit early
        if (files.length === 0) {
            stream.markdown('  - No files found in your workspace 😢\n');
            return;
        }

        // Let's update the chat and say we found some files
        stream.markdown(
            `  - Found ${files.length} Python files in your workspace 💡\n`
        );

        // Now we loop through and find files that `import openai`
        const filesWithPrompts: Array<{ path: string; contents: string }> = [];
        for (const file of files) {
            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();

            // Check if the file contains any of the common imports
            if (text.includes('import openai')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.includes('from openai import')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.includes('from anthropic import Anthropic')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.includes('import anthropic')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.includes('import cohere')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            }
            //check with regex if file contains any of the common variable names
            else if (
                text.match(
                    /[Pp][Rr][Oo][Mm][Pp][Tt]|[Tt][Ee][Mm][Pp][Ll][Aa][Tt][Ee]/
                )
            ) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.match(/Template|Message/)) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.match(/content|message/)) {
                filesWithPrompts.push({ path: file.path, contents: text });
            }

            // TODO: other ways to import openai or other common LLM libraries?
        }

        // Now we can update the chat with the files we found
        if (filesWithPrompts.length > 0) {
            stream.markdown(
                `  - Found ${filesWithPrompts.length} files that match coarse filters 🎉\n`
            );
        } else {
            stream.markdown('  - No files with prompts found 😢\n');
        }

        // For each file, we'll parse it and look for the prompts
        const prompts = await findPrompts(this.extensionUri, filesWithPrompts);
        if (prompts.length === 0) {
            stream.markdown('  - No prompts found in any files 😢\n');
            return;
        } else {
            stream.markdown(
                `  - Found ${prompts.length} prompts in your workspace!\n\n`
            );
        }

        stream.markdown('**📖 Here are the prompts I found**:\n');

        // Let's render a button for each prompt
        for (const prompt of prompts) {
            const justFileName = prompt.sourceFilePath.split('/').pop();

            stream.markdown(
                `  ${prompts.indexOf(prompt) + 1}. 📝 Prompt ${prompt.id.slice(0, 8)}... in \`${justFileName}:${prompt.startLocation.line}\` \n`
            );
            stream.anchor(
                new vscode.Location(
                    vscode.Uri.file(prompt.sourceFilePath),
                    new vscode.Range(prompt.startLocation, prompt.endLocation)
                ),
                `Click to view`
            );
            //create a button to save the prompt to clipboard
            stream.button({
                command: PROMPT_SAVE_FOR_ANALYSIS,
                arguments: [prompt],
                title: 'Save for Analysis',
            });

            stream.markdown('\n\n');
        }
    }

    private async _handleAnalyzeBias(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(
            'This module will attempt to analyze the bias of the selected prompts.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'It will default to using the text selected in the editor as a prompt.'
        );
        stream.markdown('\n\n');
        stream.markdown(
            'If no text is selected, it will default to using the prompt saved internally via the find prompts command.'
        );
        stream.markdown('\n\n');
        // check if text is selected
        const editor = vscode.window.activeTextEditor;
        let tempPrompt: PromptMetadata | undefined = undefined;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            if (selectedText) {
                const startLocation =
                    vscode.window.activeTextEditor?.selection.start;
                const endLocation =
                    vscode.window.activeTextEditor?.selection.end;

                stream.markdown(
                    'Parsing selected text and looking for corresponding prompt...'
                );
                stream.markdown('\n\n');
                tempPrompt = await this._findCorrespondingPromptObject(
                    selectedText,
                    startLocation,
                    endLocation
                );

                if (!tempPrompt) {
                    stream.markdown(
                        'No corresponding prompt found in the current file, make sure you select the complete prompt, and that the prompt is saved in the current file, and the file is correctly written.'
                    );
                    stream.markdown('\n\n');
                    stream.markdown(
                        ' Will attempt to parse the saved prompt instead'
                    );
                } else {
                    stream.markdown('Analyzing selected text...');
                    stream.markdown('\n\n');
                    const biasAnalysis = await checkGenderBias(tempPrompt);
                    // Render the results
                    stream.markdown('**📊 Bias Analysis Results**:');
                    stream.markdown('\n\n');
                    stream.markdown(
                        this.handleGenderBiasAnalysis(biasAnalysis)
                    );
                    return { metadata: { command: 'analyze-bias' } };
                }
            }
        }
        const prompt = this.savedPrompt;
        if (prompt !== undefined) {
            stream.markdown('Analyzing prompt saved for analysis...');
            const biasAnalysis = await checkGenderBias(prompt);
            // Render the results
            stream.markdown('**📊 Bias Analysis Results**:');
            stream.markdown('\n\n');
            stream.markdown(this.handleGenderBiasAnalysis(biasAnalysis));
            return { metadata: { command: 'analyze-bias' } };
        } else {
            if (editor) {
                stream.markdown(
                    'No prompt found saved and no text selected in active editor'
                );
                return { metadata: { command: 'analyze-bias' } };
            }
            stream.markdown('No prompt found saved and no active editor');
            return { metadata: { command: 'analyze-bias' } };
        }
    }

    private handleGenderBiasAnalysis(json: JSONSchemaObject): string {
        // get gender_bias value
        let return_message = '';
        const genderBias: boolean = json['gender_bias'] as boolean;
        const genderBiasPotential: boolean = json[
            'may_cause_gender_bias'
        ] as boolean;
        if (genderBias && genderBiasPotential) {
            return_message +=
                'This message is potentially gender biased and may cause gender biased responses.';
            return_message += '\n\n';
        } else if (genderBias) {
            return_message += 'This message is potentially gender biased.';
            return_message += '\n\n';
        } else if (genderBiasPotential) {
            return_message +=
                'This message is likely not gender biased, but may cause gender biased responses';
            return_message += '\n\n';
        }
        if (!genderBias && !genderBiasPotential) {
            if (json['error']) {
                return_message += 'Error: ';
                return_message += json['error'];
                return_message += '\n\n';
                return return_message;
            }
            return_message +=
                'This message is  likely not gender biased, and will probably not cause gender biased responses';
            return_message += '\n\n';
            return_message += '🎉🎉🎉';
            return_message += '\n\n';
            return return_message;
        }
        return_message += ' **Explanation:** ';
        return_message = return_message.concat(json['reasoning'] as string);
        return_message += '\n \n';
        return return_message;
    }

    private _processInjectionVulnerabilityAnalysisJSON(
        json: JSONSchemaObject,
        stream: vscode.ChatResponseStream
    ) {
        // var return_message = "";
        const injectionVul = json['vulnerable'] as string;
        // convert json array  to string array
        const poisonedExamplesArray = json['poisoned_responses'] as Array<
            [string, string]
        >;
        const poisonedExamplesSet = Array.from(new Set(poisonedExamplesArray));
        if (injectionVul === 'Yes' || injectionVul === 'Maybe') {
            if (injectionVul === 'Yes') {
                stream.markdown(
                    'This message is vulnerable to prompt injection and may generate poisoned responses.'
                );
            } else {
                stream.markdown(
                    'This message may be vulnerable to prompt injection and may generate poisoned responses.'
                );
            }
            stream.markdown('\n\n');

            let possibly = ''; // default to delete character
            // add poisoned examples to response numbered and separated by new line
            if (injectionVul === 'Maybe') {
                possibly = '**Possibly** ';
            }
            //get count of unique poisoned variables
            const poisonedVariables = new Set<string>();
            for (let i = 0; i < poisonedExamplesSet.length; i++) {
                poisonedVariables.add(poisonedExamplesSet[i][0]);
            }

            stream.markdown(
                `**📈 Percentage of ${possibly} Vulnerable Variables:** ${((poisonedVariables.size / (json['total_variables_in_prompt'] as number)) * 100).toFixed(2)} `
            );
            stream.markdown('\n\n');
            // print the names of the variables that are vulnerable
            stream.markdown(
                `**🐼 ${possibly} Vulnerable Variables:** ${Array.from(
                    poisonedVariables
                ).join(', ')}`
            );
            stream.markdown('\n\n');

            // calculate the percentage of successful attacks and show in :.2f format
            stream.markdown(
                `**📈 Percentage of ${possibly} Successful Attacks:** ${((poisonedExamplesArray.length / (json['total_attempts'] as number)) * 100).toFixed(2)} `
            );

            stream.markdown('\n\n');

            stream.markdown(`☠️ ${possibly} Poisoned Responses Examples:`);
            stream.markdown('\n\n');
            // convert poisoned examples array into set of unique tuples

            // if more than 10 unique poisoned examples, print only the first 10

            for (let i = 0; i < Math.min(10, poisonedExamplesSet.length); i++) {
                const poisonedExampleResponse = poisonedExamplesSet[i][1];
                const injectionPoint = poisonedExamplesSet[i][0].replaceAll(
                    '+',
                    ''
                );
                // if example is less than 200 characters
                // print full example
                if (poisonedExampleResponse.length < 200) {
                    stream.markdown(
                        `${i + 1}. **Injection Point:** ${injectionPoint}`
                    );
                    stream.markdown('\n\n');
                    stream.markdown(
                        `${possibly}**Poisoned response:** ${poisonedExampleResponse.replaceAll('\n', ' ')}`
                    );
                    stream.markdown('\n\n');
                } else {
                    // print first 200 characters of example
                    // create temporary file that contains the full example
                    // add anchor to open the file
                    const croppedExampleResponse = poisonedExampleResponse
                        .slice(0, 200)
                        .replaceAll('\n', ' ');
                    stream.markdown(
                        `${i + 1}. **Injection Point:** ${injectionPoint}`
                    );
                    stream.markdown('\n\n');
                    stream.markdown(
                        ` ${possibly}**Poisoned Response:** ${croppedExampleResponse}...`
                    );
                    // create a temporary file

                    const tempFile = path.join(
                        tmpDir,
                        `poisonedExample-${i + 1}.txt`
                    );
                    fs.writeFileSync(tempFile, poisonedExampleResponse);
                    stream.anchor(
                        vscode.Uri.file(tempFile),
                        'Click to view full example'
                    );
                    stream.markdown('\n');
                }
                stream.markdown('\n\n');
            }
        } else {
            if (json['error']) {
                stream.markdown('Error: ');
                stream.markdown(json['error'] as string);
                stream.markdown('\n\n');
            } else {
                stream.markdown(
                    'This message is likely not vulnerable to prompt injection, and will probably not cause unintended responses.'
                );
                stream.markdown('\n\n');
                stream.markdown('🎉🎉🎉');
                stream.markdown('\n\n');
            }
        }
    }

    private async _handleSuggestByRules(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        this._sendCommandStartMessage(
            stream,
            'suggest a new prompt using rules suggested by OpenAI'
        );

        const prompt = await this._getPrompt(stream);
        if (prompt) {
            stream.markdown('\n\n');
            const suggestion = await suggestImprovement(prompt);
            // Render the results
            stream.markdown('**Suggestion Results**:\n\n');
            stream.markdown(this.handleSuggestImprovement(suggestion));
        }
        return { metadata: { command: 'suggest-by-rules' } };
    }

    private handleSuggestImprovement(response: JSONSchemaObject): string {
        let return_message = '';
        if (response.error) {
            return_message += 'Error: ';
            return_message += response.error as string;
            return_message += '\n\n';
        } else if (response.suggestion) {
            return_message += ' **Suggestion:** \n\n';
            return_message += response.suggestion as string;
            return_message += '\n\n';
        } else {
            return_message += 'Response from API was poorly formatted.';
            return_message += '\n\n';
        }

        return return_message;
    }

    _sendCommandStartMessage(
        stream: vscode.ChatResponseStream,
        command: string
    ) {
        stream.markdown(`This module will attempt to ${command}.\n\n`);
        stream.markdown(
            'It will default to using the text selected in the editor as a prompt.\n\n'
        );
        stream.markdown(
            'If no text is selected, it will default to using the prompt saved internally via the find prompts command.\n\n'
        );
    }

    async _getPrompt(stream: vscode.ChatResponseStream) {
        const editor = vscode.window.activeTextEditor;
        let prompt = this.savedPrompt;

        const selectedText = editor?.document.getText(editor.selection);
        if (selectedText) {
            const startLocation =
                vscode.window.activeTextEditor?.selection.start;
            const endLocation = vscode.window.activeTextEditor?.selection.end;

            stream.markdown(
                'Parsing selected text and looking for corresponding prompt...\n\n'
            );
            let tempPrompt = await this._findCorrespondingPromptObject(
                selectedText,
                startLocation,
                endLocation
            );

            if (tempPrompt) {
                prompt = tempPrompt;
            } else {
                stream.markdown(
                    'No corresponding prompt found in the current file, make sure you select the complete prompt, and that the prompt is saved in the current file, and the file is correctly written.\n\n'
                );
                stream.markdown(
                    'Will attempt to parse the saved prompt instead\n\n'
                );
            }
        }

        if (!prompt && editor) {
            stream.markdown(
                'No prompt found saved and no text selected in active editor'
            );
        } else if (!prompt) {
            stream.markdown('No prompt found saved and no active editor');
        }

        return prompt;
    }

    async _findCorrespondingPromptObject(
        promptText: string,
        startLocation?: vscode.Position,
        endLocation?: vscode.Position
    ): Promise<PromptMetadata | undefined> {
        // get name of current file
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const currentFile = editor.document.fileName;
            // search for prompts in current file
            // TODO might be interesting to implement caching on the prompts in the cu
            if (this.extensionUri) {
                const prompts = await findPrompts(this.extensionUri, [
                    { path: currentFile, contents: editor.document.getText() },
                ]);
                // find the prompt that encompassing start and end locations
                if (startLocation && endLocation) {
                    for (let i = 0; i < prompts.length; i++) {
                        if (
                            (prompts[i].startLocation.line <
                                startLocation.line ||
                                (prompts[i].startLocation.line ===
                                    startLocation.line &&
                                    prompts[i].startLocation.character <=
                                        startLocation.character)) &&
                            (prompts[i].endLocation.line > endLocation.line ||
                                (prompts[i].endLocation.line ===
                                    endLocation.line &&
                                    prompts[i].endLocation.character >=
                                        endLocation.character))
                        ) {
                            let promptToReturn = Object.assign(
                                Object.create(
                                    Object.getPrototypeOf(prompts[i])
                                ),
                                prompts[i]
                            );
                            if (this.customSystemPrompt) {
                                promptToReturn.selectedSystemPromptText =
                                    this.customSystemPrompt;
                            }
                            return promptToReturn;
                        }
                    }
                }

                // find the prompt that matches the prompt text
                for (let i = 0; i < prompts.length; i++) {
                    if (prompts[i].rawText === promptText) {
                        let promptToReturn = Object.assign(
                            Object.create(Object.getPrototypeOf(prompts[i])),
                            prompts[i]
                        );
                        if (this.customSystemPrompt) {
                            promptToReturn.selectedSystemPromptText =
                                this.customSystemPrompt;
                        }
                        return promptToReturn;
                    }
                }

                // if no prompt is found return the first prompt that contains the prompt text
                for (let i = 0; i < prompts.length; i++) {
                    if (prompts[i].rawText.includes(promptText)) {
                        let promptToReturn = Object.assign(
                            Object.create(Object.getPrototypeOf(prompts[i])),
                            prompts[i]
                        );
                        if (this.customSystemPrompt) {
                            promptToReturn.selectedSystemPromptText =
                                this.customSystemPrompt;
                        }
                        return promptToReturn;
                    }
                }
                // if no prompt is found return the prompt that contains the biggest part of the prompt text
                let maxMatch = 0;
                let maxMatchIndex = 0;
                for (let i = 0; i < prompts.length; i++) {
                    const match = promptText.match(prompts[i].rawText);
                    if (match && match.length > maxMatch) {
                        maxMatch = match.length;
                        maxMatchIndex = i;
                    }
                }
                let promptToReturn = Object.assign(
                    Object.create(
                        Object.getPrototypeOf(prompts[maxMatchIndex])
                    ),
                    prompts[maxMatchIndex]
                );
                if (this.customSystemPrompt) {
                    promptToReturn.selectedSystemPromptText =
                        this.customSystemPrompt;
                }
                return promptToReturn;
            }
        }
        return undefined;
    }
}
