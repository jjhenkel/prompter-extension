// import * as vscode from 'vscode';

// const LANGUAGE_MODEL_ID = 'copilot-gpt-4';

// class PrompterAgent {
//     constructor() {
//     }

//     async chatHandler(
//         request: vscode.ChatAgentRequest,
//         context: vscode.ChatAgentContext,
//         stream: vscode.ChatAgentResponseStream,
//         token: vscode.CancellationToken
//     ): Promise<vscode.ChatAgentResult2 | undefined> {
//         if (request.command === 'identiy') {
//             return this.identifyPrompts(request, context, stream, token);
//         }
        
//         // Add a return statement here
//         return undefined;
//     }

//     private async identifyPrompts(
//         request: vscode.ChatAgentRequest,
//         context: vscode.ChatAgentContext,
//         stream: vscode.ChatAgentResponseStream,
//         token: vscode.CancellationToken
//     ): Promise<vscode.ChatAgentResult2> {
//         const access = await vscode.lm.requestLanguageModelAccess(LANGUAGE_MODEL_ID);
//         const topics = ['linked list', 'recursion', 'stack', 'queue', 'pointers'];
//         const topic = topics[Math.floor(Math.random() * topics.length)];
//             const messages = [
// 				new vscode.LanguageModelSystemMessage('You are a cat! Your job is to explain computer science concepts in the funny manner of a cat. Always start your response by stating what concept you are explaining.'),

// 				new vscode.LanguageModelUserMessage(topic)
//             ];
//             const chatRequest = access.makeChatRequest(messages, {}, token);
            
//             for await (const fragment of chatRequest.stream) {
//                 stream.markdown(fragment);
//             }


//             return { metadata: { command: 'teach' } };
//     }

//     createAgent() {
//         return vscode.chat.createChatAgent('prompter', this.chatHandler);
//     }
    
// }