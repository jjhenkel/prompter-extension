// this is a driver program that allows us to use the different modules directly for batch processing

// import the modules

import { exit } from 'process';
import checkSexualityBias from '../modules/bias-modules/sexuality-bias-module';
import { PromptMetadata } from '../modules/prompt-finder';
// import { canonizeStringWithLLM } from './modules/prompt-finder/canonization';
import {
    getAPIKey,
    getClient,
    getEndpoint,
    setAPIKey,
    setEndpoint,
} from '../modules/LLMUtils';
import readline from 'readline';
// import { parse } from 'csv-parse';

type hate_data = {
    text: string;
    label: string;
};

async function load_txt(): Promise<hate_data[]> {
    const hateOneFilePath = '../../data/baselines/XHate999-EN-Gao-test.txt';
    const hateTwoFilePath = '../../data/baselines/XHate999-EN-Trac-test.txt';
    const hateThreeFilePath = '../../data/baselines/XHate999-EN-Wul-test.txt';
    const fileContentOne = fs.readFileSync(hateOneFilePath, {
        encoding: 'utf-8',
    });
    const fileContentTwo = fs.readFileSync(hateTwoFilePath, {
        encoding: 'utf-8',
    });
    const fileContentThree = fs.readFileSync(hateThreeFilePath, {
        encoding: 'utf-8',
    });
    let hate_data_rows: hate_data[] = [];

    // read the first file line by line, columns are separated by tab
    let lines = fileContentOne.split('\n');
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].split('\t');
        if (line.length === 2) {
            hate_data_rows.push({
                text: line[0],
                label: line[1],
            });
        }
    }

    let linesTwo = fileContentTwo.split('\n');
    for (let i = 1; i < linesTwo.length; i++) {
        let line = linesTwo[i].split('\t');
        if (line.length === 2) {
            hate_data_rows.push({
                text: line[0],
                label: line[1],
            });
        }
    }
    let linesThree = fileContentThree.split('\n');
    for (let i = 1; i < linesThree.length; i++) {
        let line = linesThree[i].split('\t');
        if (line.length === 2) {
            hate_data_rows.push({
                text: line[0],
                label: line[1],
            });
        }
    }

    return hate_data_rows;
}
const fs = require('fs');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function readFromConsole(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer);
            // rl.close();
        });
    });
}

main().finally(() => {
    rl.close(); // Close the readline interface
});

async function processGenderBiasCheckPrompt(prompt: hate_data) {
    let tempPromptMeta: PromptMetadata = {
        id: '0',
        rawText: prompt.text,
    } as PromptMetadata;
    // const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);

    tempPromptMeta.normalizedText = JSON.stringify(tempPromptMeta.rawText);
    // tempPromptMeta.templateValues = tup[1];
    try {
        let result = await checkSexualityBias(
            tempPromptMeta
            // create a new prompt metadata object with the prompt text and the prompt id
        );
        // console.log(result);
        console.log('Processed prompt: ' + prompt.text);
        return {
            // id: prompt.id,
            // dataset: prompt.dataset,
            text: prompt.text,
            original_label: prompt.label,
            // toxicity: prompt.toxicity,
            // sexist: prompt.sexist,
            // of_id: prompt.of_id,
            result: result,
        };
    } catch (e) {
        console.log(JSON.stringify(e));
    }
}

async function main() {
    let c = getClient();
    setAPIKey(c?.apiKey!);
    setEndpoint(c?.baseURL!);
    let prompts: hate_data[] = await load_txt();

    // if API key not defined in current LLMConfig, ask for API key in console
    if (
        getAPIKey() === undefined ||
        getAPIKey() === '' ||
        getAPIKey() === null
    ) {
        console.log('API key not found in LLMConfig. ');
        const apiKey = await readFromConsole(
            'Please enter your OpenAI API key: '
        );
        setAPIKey(apiKey);
    }

    if (
        getEndpoint() === undefined ||
        getEndpoint() === '' ||
        getEndpoint() === null
    ) {
        console.log('Endpoint not found in LLMConfig. ');
        const endpoint = await readFromConsole(
            'Please enter your OpenAI Endpoint: '
        );
        setEndpoint(endpoint);
    }

    // read existing results_banchmark.json file, and extract the ids that were already processed
    // let existingResults = JSON.parse(
    //     fs.readFileSync('results_benchmark.json', 'utf8')
    // );
    // let existingIds = existingResults.map((result: any) => result?.id);
    // existingResults = JSON.parse(
    //     fs.readFileSync('results_benchmark-2.json', 'utf8')
    // );
    // // add the ids from the second file to the existingIds
    // existingIds = existingIds.concat(
    //     existingResults.map((result: any) => result?.id)
    // );

    let results_benchmark = [];
    // for (let i = 1; i < 11; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: prompts[i].text,
    //     } as PromptMetadata;
    //     // const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = JSON.stringify(tempPromptMeta.rawText);
    //     // tempPromptMeta.templateValues = tup[1];
    //     try {

    //         let result = await checkSexualityBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         results_benchmark.push({
    //             id: prompts[i].id,
    //             dataset: prompts[i].dataset,
    //             text: prompts[i].text,
    //             toxicity: prompts[i].toxicity,
    //             sexist: prompts[i].sexist,
    //             of_id: prompts[i].of_id,
    //             result: result,
    //         });
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }

    const sexualityCheckPromises = prompts.slice(1).map(async (prompt) => {
        return await processGenderBiasCheckPrompt(prompt);
    });
    results_benchmark = await Promise.all(sexualityCheckPromises);
    // remove already processed prompts from the list

    // if (fs.existsSync('results_benchmark-3.json')) {
    //     fs.unlinkSync('results_benchmark-3.json');
    // }

    fs.writeFileSync(
        'sexuality_bias_results_benchmark.json',
        JSON.stringify(results_benchmark)
    );

    console.log('done');

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
