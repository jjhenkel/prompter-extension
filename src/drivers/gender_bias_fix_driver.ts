// this is a driver program that allows us to use the different modules directly for batch processing

// import the modules

import { exit } from 'process';
// import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import { PromptMetadata, PromptTemplateHole } from '../modules/prompt-finder';
import { canonizeStringWithLLM } from '../modules/prompt-finder/canonization';
// import { getClient } from '../modules/LLMUtils';
import * as LLMUtils from '../modules/LLMUtils'; // Add this line to import the LLMUtils module
import { fixGenderBias } from '../modules/bias-fix-modules/gender-bias-fix-module';
// load the data from the json file

const fs = require('fs');

// const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
// });

// function readFromConsole(prompt: string): Promise<string> {
//     return new Promise((resolve) => {
//         rl.question(prompt, (answer) => {
//             resolve(answer);
//             // rl.close();
//         });
//     });
// }

// main().finally(() => {
//     rl.close(); // Close the readline interface
// });

async function generatedRandomUniqueID(ids_generated: string[]) {
    let id = Math.random().toString(36).substring(2, 15);
    while (ids_generated.includes(id)) {
        id = Math.random().toString(36).substring(2, 15);
    }
    ids_generated.push(id);
    return id;
}

async function processGenderBiasPromptSetFix(
    text: string,
    ids_generated: string[]
) {
    let temp_id = await generatedRandomUniqueID(ids_generated);
    let tempPromptMeta: PromptMetadata = {
        id: temp_id,
        rawText: text,
    } as PromptMetadata;
    try {
        const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
        tempPromptMeta.normalizedText = tup[0];
        tempPromptMeta.templateValues = tup[1];
    } catch (e) {
        tempPromptMeta.normalizedText = tempPromptMeta.rawText;
        const templateHoles: { [key: string]: PromptTemplateHole } = {};
        const regex = /{{(.*?)}}/g;
        // regex for  the word Placeholder regardgles of  case
        const regex_2 = /PLACEHOLDER/g;
        let match;
        while ((match = regex.exec(tempPromptMeta.normalizedText))) {
            const holeName: string = match[1];
            // get the start and end location of the hole in the normalized response in the parsed node
            let _startLocation = 0;
            let _endLocation = 0;

            templateHoles[holeName] = {
                name: holeName,
                inferredType: 'string',
                rawText: match[0],
                // get the start and end location of the hole in the normalized response in the parsed node
                startLocation: _startLocation,
                endLocation: _endLocation,
            };
        }
        let i = 0;
        while ((match = regex_2.exec(tempPromptMeta.normalizedText))) {
            const holeName: string = 'PLACEHOLDER' + '_' + i;
            i += 1;
            // get the start and end location of the hole in the normalized response in the parsed node

            templateHoles[holeName] = {
                name: holeName,
                inferredType: 'string',
                rawText: match[0],
                // get the start and end location of the hole in the normalized response in the parsed node
                startLocation: 0,
                endLocation: 0,
            };
        }
        tempPromptMeta.templateValues = templateHoles;
    }
    try {
        // patchHoles(tempPromptMeta);
        let result = await fixGenderBias(
            tempPromptMeta
            // create a new prompt metadata object with the prompt text and the prompt id
        );
        // console.log(result);
        console.log('Processed prompt ' + temp_id + ' successfully.');
        return {
            text: text,
            templateValues: tempPromptMeta.templateValues,
            result: result,
        };
    } catch (e) {
        console.log('Error processing prompt' + temp_id + '.');
        console.log(JSON.stringify(e));
    }
}

async function main() {
    // let c = await getClient();
    const ids_generated: string[] = [];
    let a = await LLMUtils.main();
    if (a !== 'done') {
        console.log('Error in LLMUtils');
        exit();
    }

    let file_content = fs.readFileSync(
        'C:/Users/t-drzig/Documents/VS Code/prompter-extension/data/promptsToFix/list_gender_bias.json',
        'utf8'
    );

    // remove tokens that might cause json parsing issues

    const biasedPrompts: string[] = JSON.parse(file_content);
    console.log('Biased Prompts number:', biasedPrompts.length);

    let results = [];
    // let resultsOneVar = [];
    // let resultsTwoVar = [];
    // let resultsThreeVar = [];
    // let resultsFourVar = [];
    // let resultsFiveVar = [];
    // let resultsFivePlusVar = [];
    console.log('running gender-bias fix');
    const genderFixPromises_0 = biasedPrompts.map(async (prompt) => {
        return await processGenderBiasPromptSetFix(prompt, ids_generated);
    });

    results = await Promise.all(genderFixPromises_0);
    if (
        fs.existsSync(
            'C:/Users/t-drzig/Documents/VS Code/prompter-extension/src/drivers/results/gender-fix-results.json'
        )
    ) {
        fs.unlinkSync(
            'C:/Users/t-drzig/Documents/VS Code/prompter-extension/src/drivers/results/gender-fix-results.json'
        );
    }
    fs.writeFileSync(
        'C:/Users/t-drzig/Documents/VS Code/prompter-extension/src/drivers/results/gender-fix-results.json',
        JSON.stringify(results)
    );
    console.log('results done');

    console.log('done');
    // }
    exit();
}

function getRandomElements(arr_original: string[], n: number): string[] {
    //PLACEHOLDER is not supported right now, ignoring it.
    let arr = arr_original.filter((item) => !item.includes('PLACEHOLDER'));
    if (n > arr_original.length) {
        throw new RangeError(
            'getRandomElements: more elements requested than available'
        );
    }
    let shuffled = arr
        .map((value) => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
    return shuffled.slice(0, n);
}

main();
