import * as vscode from 'vscode';
import { findPrompts } from '../modules/prompt-finder';
import checkGenderBias from '../modules/bias-modules/gender_bias/gender-bias-module';
import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import checkVariableInjection from '../modules/injection-module/var-injection-module';
import * as os from 'os';
const fs = require('fs');
const path = require('path');
const tempdir = os.tmpdir();

interface IPrompterChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

// Let's use the faster model. Alternative is 'copilot-gpt-4', which is slower but more powerful
const GPT_35_TURBO = 'copilot-gpt-3.5-turbo';
const GPT_4 = 'copilot-gpt-4';
const PROMPT_SAVE_FOR_ANALYSIS = 'prompter.savePrompt';

// A 'participant' is a chat agent that can respond to chat messages
// and interact with the user. Here we define our 'Prompter' participant.
export class PrompterParticipant {

    private static readonly ID = 'prompter';
    private extensionUri: vscode.Uri | undefined;
    private prompt: string = '';

    activate(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;

        // Chat participants appear as top-level options in the chat input
        // when you type `@`, and can contribute sub-commands in the chat input
        // that appear when you type `/`.
        // const ref_handler: vscode.ChatRequestHandler = this.handler; 
        const prompter = vscode.chat.createChatParticipant(PrompterParticipant.ID, this.handler.bind(this));

        // Prompter is persistent, whenever a user starts interacting with @prompter, it
        // will be added to the following messages
        prompter.isSticky = true;

        prompter.iconPath = vscode.Uri.joinPath(this.extensionUri, 'src/logo.jpg');
        // prompter.description = vscode.l10n.t('Let\'s analyze and improve some prompts!');
        // prompter.
        prompter.followupProvider = {
            provideFollowups(result: IPrompterChatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
                return [
                    { prompt: 'find-prompts', command: 'find-prompts', label: 'Find prompts in your workspace' },
                    { prompt: 'analyze-bias', command: 'analyze-bias', label: 'Analyze bias for a selected prompt' },
                    { prompt: 'analyze-injection-vulnerability', command: 'analyze-injection-vulnerability', label: 'Analyze injection vulnerability of a selected prompt' },
                    { prompt: 'help', command: 'help', label: 'Get help with using prompter' }
                ];
            }
        };

        // Add the participant to the context's subscriptions
        // context.subscriptions.push(prompter);
        // console.log('Prompter activated');

        // Define context commands 
        context.subscriptions.push(
            prompter,
            // Register the command handler for the copy to clipboard command
            vscode.commands.registerCommand(PROMPT_SAVE_FOR_ANALYSIS, (args: string) => {
                const text = args;
                // copy the prompt to an internal variable 
                this.prompt = text;
                // show a message to the user in large window

                // vscode.window.showInformationMessage('Prompt saved for analysis');
                const header = "Prompt saved for analysis,You can now call other commands from prompter to analyze the prompt.";
                const options = {
                    detail: "",
                    modal: false,
                };
                vscode.window.showInformationMessage(header, options, ...["Ok", "Cancel"]).then((selection) => {
                    // console.log(selection);
                    if (selection === "Cancel") {
                        vscode.window.showInformationMessage("Prompt not saved, saved prompt will be cleared.");
                        this.prompt = '';
                    }
                });
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
            case 'help': {
                await this._handleHelp(request, context, stream, token);
                return { metadata: { command: 'help' } };
            }
            case 'analyze-bias': {
                await this._handleAnalyzeBias(request, context, stream, token);
                return { metadata: { command: 'analyze-bias' } };
            }
            case 'analyze-injection-vulnerability': {
                await this._handleInjectionVulnerability(request, context, stream, token);
                return { metadata: { command: 'analyze-injection-vulnerability' } };
            }
            default: {
                stream.markdown('Hey, I\'m prompter! I can help you find prompts, analyze bias, and more. Try typing `/` to see what I can do.');
                return { metadata: { command: '' } };
            }
        }
    }
    private async _handleInjectionVulnerability(request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
        stream.markdown('This module will attempt to analyze the selected prompts for injection vulnerability.');
        stream.markdown('\n\n');
        stream.markdown('It will default to using the text selected in the editor as a prompt.');
        stream.markdown('\n\n');
        stream.markdown('If no text is selected, it will default to using the prompt saved internally via the find prompts command.');
        stream.markdown('\n\n');
        // check if text is selected 
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            if (selectedText) {
                // if selected text is found, analyze it
                stream.markdown('Analyzing selected text... [This may take a while]');
                stream.markdown('\n\n');
                const biasAnalysis = await checkVariableInjection(selectedText);
                // Render the results
                stream.markdown('**🎯 Injection Vulnerability Analysis Results**:');
                stream.markdown('\n\n');
                this._processInjectionVulnerabilityAnalysisJSON(biasAnalysis, stream);
                return { metadata: { command: 'analyze-injection-vulnerability' } };
            }
        }
        const prompt = this.prompt;
        if (prompt !== '') {
            stream.markdown('Analyzing prompt saved for analysis...');
            const biasAnalysis = await checkVariableInjection(prompt);
            // Render the results
            stream.markdown('**🎯 Injection Vulnerability Analysis Results**:');
            stream.markdown('\n\n');
            this._processInjectionVulnerabilityAnalysisJSON(biasAnalysis, stream);
            return { metadata: { command: 'analyze-injection-vulnerability' } };
        } else {
            if (editor) {
                stream.markdown('No prompt found saved and no text selected in active editor');
                return { metadata: { command: 'analyze-injection-vulnerability' } };
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
            return str.split('\n').map(line => line.slice(numSpaces)).join('\n');
        }

        return str.trim();
    }

    private async _handleHelp(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) {
        stream.markdown(this._cleanUpMarkdownString(`
            Hey, I'm **prompter**!
            
            I can help you find prompts, analyze bias, and more.
            
            Here are the sub-commands I support:
              - \`/find-prompts\`: Find prompts in your workspace
              - \`/analyze-bias\`: Analyze bias for a selected prompt
              - \`/help\`: Show this help message
        `));
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
        stream.markdown(`  - Found ${files.length} Python files in your workspace 💡\n`);

        // Now we loop through and find files that `import openai`
        const filesWithPrompts: Array<{ path: string; contents: string; }> = [];
        for (const file of files) {

            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();

            if (text.includes('import openai')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            } else if (text.includes('from openai import')) {
                filesWithPrompts.push({ path: file.path, contents: text });
            }
            // TODO: other ways to import openai or other common LLM libraries?
        }

        // Now we can update the chat with the files we found
        if (filesWithPrompts.length > 0) {
            stream.markdown(`  - Found ${filesWithPrompts.length} files that match coarse filters 🎉\n`);
        } else {
            stream.markdown('  - No files with prompts found 😢\n');
        }

        // For each file, we'll parse it and look for the prompts
        const prompts = await findPrompts(this.extensionUri, filesWithPrompts);
        if (prompts.length === 0) {
            stream.markdown('  - No prompts found in any files 😢\n');
            return;
        } else {
            stream.markdown(`  - Found ${prompts.length} prompts in your workspace!\n\n`);
        }

        stream.markdown('**📖 Here are the prompts I found**:\n');

        // Let's render a button for each prompt
        for (const prompt of prompts) {
            const justFileName = prompt.sourceFilePath.split('/').pop();

            stream.markdown(`  1. 📝 Prompt ${prompt.id.slice(0, 8)}... in \`${justFileName}:${prompt.startLocation.line}\` \n`);
            stream.anchor(new vscode.Location(
                vscode.Uri.file(prompt.sourceFilePath),
                new vscode.Range(prompt.startLocation, prompt.endLocation)
            ), `Click to view`);
            //create a button to save the prompt to clipboard
            stream.button({
                command: PROMPT_SAVE_FOR_ANALYSIS, arguments: [prompt.rawText],
                title: 'Save for Analysis'
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
        stream.markdown('This module will attempt to analyze the bias of the selected prompts.');
        stream.markdown('\n\n');
        stream.markdown('It will default to using the text selected in the editor as a prompt.');
        stream.markdown('\n\n');
        stream.markdown('If no text is selected, it will default to using the prompt saved internally via the find prompts command.');
        stream.markdown('\n\n');
        // check if text is selected 
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selectedText = editor.document.getText(editor.selection);
            if (selectedText) {
                // if selected text is found, analyze it
                stream.markdown('Analyzing selected text...');
                stream.markdown('\n\n');
                const biasAnalysis = await checkGenderBias(selectedText);
                // Render the results
                stream.markdown('**📊 Bias Analysis Results**:');
                stream.markdown('\n\n');
                stream.markdown(this._processGenderBiasAnalysisJSON(biasAnalysis));
                return { metadata: { command: 'analyze-bias' } };
            }
        }
        const prompt = this.prompt;
        if (prompt !== '') {
            stream.markdown('Analyzing prompt saved for analysis...');
            const biasAnalysis = await checkGenderBias(prompt);
            // Render the results
            stream.markdown('**📊 Bias Analysis Results**:');
            stream.markdown('\n\n');
            stream.markdown(this._processGenderBiasAnalysisJSON(biasAnalysis));
            return { metadata: { command: 'analyze-bias' } };
        } else {
            if (editor) {
                stream.markdown('No prompt found saved and no text selected in active editor');
                return { metadata: { command: 'analyze-bias' } };
            }
            stream.markdown('No prompt found saved and no active editor');
            return { metadata: { command: 'analyze-bias' } };
        }
    }
    private _processGenderBiasAnalysisJSON(json: JSONSchemaObject): string {
        // get gender_bias value 
        var return_message = "";
        const genderBias: boolean = (json['gender_bias'] as boolean);
        const genderBiasPotential: boolean = (json['may_cause_gender_bias'] as boolean);
        if (genderBias && genderBiasPotential) {
            return_message += 'This message is potentially gender biased and may cause gender biased responses.';
            return_message += '\n\n';
        } else if (genderBias) {
            return_message += 'This message is potentially gender biased.';
            return_message += '\n\n';
        } else if (genderBiasPotential) {
            return_message += 'This message is likely not gender biased, but may cause gender biased responses';
            return_message += '\n\n';
        }
        if (!genderBias && !genderBiasPotential) {
            if (json['error']) {
                return_message += 'Error: ';
                return_message += json['error'];
                return_message += '\n\n';
                return return_message;
            }
            return_message += 'This message is  likely not gender biased, and will probably not cause gender biased responses';
            return_message += '\n\n';
            return_message += '🎉🎉🎉';
            return_message += '\n\n';
            return return_message;
        }
        return_message += " **Explanation:** ";
        return_message = return_message.concat(json['reasoning'] as string);
        return_message += '\n \n';
        return return_message;
    }

    private _processInjectionVulnerabilityAnalysisJSON(json: JSONSchemaObject, stream: vscode.ChatResponseStream) {
        // var return_message = "";
        const injectionVul = json['vulnerable'] as string;
        // convert json array  to string array 
        const poisonedExamplesArray = json['poisoned_responses'] as Array<[string, string]>;
        const poisonedExamplesSet = Array.from(new Set(poisonedExamplesArray));
        if (injectionVul === "Yes" || injectionVul === "Maybe") {
            if (injectionVul === "Yes") {
                stream.markdown('This message is vulnerable to prompt injection and may generate poisoned responses.');
            } else {
                stream.markdown('This message may be vulnerable to prompt injection and may generate poisoned responses.');
            }
            stream.markdown('\n\n');
            // add poisoned examples to response numbered and separated by new line
            if (injectionVul==="Maybe")
            {
                stream.markdown('Possibly ');
            }
            stream.markdown('Poisoned Responses Examples:');
            stream.markdown('\n\n');
            // convert poisoned examples array into set of unique tuples

                     
            for (let i = 0; i < poisonedExamplesSet.length; i++) {
                // if example is less than 100 characters 
                // print example 
                if (poisonedExamplesSet[i][1].length < 200) {
                    stream.markdown(`${i + 1}. **Injection Point:** ${poisonedExamplesSet[i][0]} ;`);
                    if (injectionVul==="Maybe")
                    {
                        stream.markdown('**Possibly**');
                    }
                    stream.markdown(` **Poisoned response:** ${poisonedExamplesSet[i][1]}`);
                    stream.markdown('\n\n');
                } else {
                    // print first 100 characters of example 
                    // create temporary file that contains the full example 
                    // add anchor to open the file
                    const temp = poisonedExamplesSet[i][1].slice(0, 200);
                    stream.markdown(`${i + 1}. **Injection Point:** ${poisonedExamplesSet[i][0]} ;`);
                    if (injectionVul==="Maybe")
                    {
                        stream.markdown('**Possibly**');
                    }
                    stream.markdown(`**Poisoned response:** ${temp}...`);
                    // create a temporary file

                    const tempFile = path.join(tempdir, `poisonedExample-${i + 1}.txt`);
                    fs.writeFileSync(tempFile, poisonedExamplesSet[i][1]);
                    stream.anchor(vscode.Uri.file(tempFile), 'Click to view full example');
                    stream.markdown('\n');
                }
                stream.markdown('\n\n');
            }
        } 
        else {
            if (json['error']) {
                stream.markdown('Error: ');
                stream.markdown(json['error'] as string);
                stream.markdown('\n\n');

            } else {
                stream.markdown('This message is likely not vulnerable to prompt injection, and will probably not cause unintended responses.');
                stream.markdown('\n\n');
                stream.markdown('🎉🎉🎉');
                stream.markdown('\n\n');
            }
        }

    }



}