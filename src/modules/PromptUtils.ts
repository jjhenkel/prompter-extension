import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';
export type promptRole = 'user' | 'system' | 'assistant';
export type serializedPrompt = {
    role: promptRole;
    content: string;
    injectedVariables?: Array<string>;
};

export function loadPromptsFromYaml(yamlPath: string): Array<serializedPrompt> {
    let biasFixPromptYaml: Array<serializedPrompt> = yaml.load(
        fs.readFileSync(path.resolve(yamlPath), 'utf8')
    ) as Array<serializedPrompt>;
    return biasFixPromptYaml;
}

export function getPromptsOfRole(
    prompts: Array<serializedPrompt>,
    role: promptRole
): Array<serializedPrompt> {
    return prompts.filter((prompt) => prompt.role === role);
}
