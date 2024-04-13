import { JSONSchemaObject } from 'openai/lib/jsonschema.mjs';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import path from 'path';

async function fixGenderBias(): Promise<JSONSchemaObject> {
    // inputPrompt: PromptMetadata
    // extract the prompt from the yaml file
    let promptYaml: Array<JSONSchemaObject> = yaml.load(
        fs.readFileSync(
            path.resolve(__dirname, 'gender_fix_prompt_1.yaml'),
            'utf8'
        )
    ) as Array<JSONSchemaObject>;
    // extract the user prompt from the yaml file
    for (let message of promptYaml) {
        console.log(JSON.stringify);
    }
    // extract the system prompt from the yaml file
    // extract the injected variables from the yaml file
    // inject text variables into prompt

    return { error: 'Not yet implemented' };
}

// fixGenderBias();
