import * as vscode from 'vscode';
import { PrompterParticipant } from './participant/prompter';

export function activate(context: vscode.ExtensionContext) {
    // Create and activate the prompter participant
    const prompter = new PrompterParticipant();
    prompter.activate(context);
}

export function deactivate() { }