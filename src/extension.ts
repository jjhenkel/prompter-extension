import * as vscode from 'vscode';
import { PrompterParticipant } from './participant/prompter';
import { commands } from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Create and activate the prompter participant
    const prompter = new PrompterParticipant();
    // commands.registerCommand('extension.prompter.save-prompt', (prompt) => {
    //     // save prompt to a temp variable
        
    // });
    prompter.activate(context);
    
}

export function deactivate() { }