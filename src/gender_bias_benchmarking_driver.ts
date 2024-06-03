// this is a driver program that allows us to use the different modules directly for batch processing

// import the modules

import { exit } from 'process';
import checkGenderBias from './modules/bias-modules/gender-bias-module';
import { PromptMetadata } from './modules/prompt-finder';
// import { canonizeStringWithLLM } from './modules/prompt-finder/canonization';
import {
    getAPIKey,
    getClient,
    getEndpoint,
    setAPIKey,
    setEndpoint,
} from './modules/LLMUtils';
import readline from 'readline';
import { parse } from 'csv-parse';

type sexism_data = {
    id: string;
    dataset: string;
    text: string;
    toxicity: string;
    sexist: string;
    of_id: string;
};

async function load_csv(): Promise<sexism_data[]> {
    const csvFilePath = '../data/baselines/sexism_data.csv';
    const headers = ['id', 'dataset', 'text', 'toxicity', 'sexist', 'of_id'];
    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });
    let sexism_data_rows: sexism_data[] = [];

    return new Promise((resolve, reject) => {
        parse(fileContent, {
            delimiter: ',',
            columns: headers,
            cast: (value, context) => {
                return value;
            },
        })
            .on('data', (record: sexism_data) => {
                sexism_data_rows.push(record);
            })
            .on('end', () => {
                resolve(sexism_data_rows);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
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

async function main() {
    let c = getClient();
    setAPIKey(c?.apiKey!);
    setEndpoint(c?.baseURL!);
    let prompts: sexism_data[] = await load_csv();

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

    // read the csv file
    // const prompts =

    // randomly select x prompts from prompt list
    // console.log('selecting random prompts');
    // const x = 5;
    // const randomPromptsNoVar: string[] = getRandomElements(
    //     prompts['one_variable_prompts'],
    //     x
    // );
    // const randomPromptsOneVar: string[] = getRandomElements(
    //     prompts['one_variable_prompts'],
    //     x
    // );
    // const randomPromptsTwoVar: string[] = getRandomElements(
    //     prompts['two_variable_prompts'],
    //     x
    // );
    // const randomPromptsThreeVar: string[] = getRandomElements(
    //     prompts['three_variable_prompts'],
    //     x
    // );
    // const randomPromptsFourVar: string[] = getRandomElements(
    //     prompts['four_variable_prompts'],
    //     x
    // );
    // const randomPromptsFiveVar: string[] = getRandomElements(
    //     prompts['five_variable_prompts'],
    //     x
    // );
    // const randomPromptsFivePlusVar: string[] = getRandomElements(
    //     prompts['more_than_five_variable_prompts'],
    //     x
    // );
    // //     // run variable injection check on each prompt set
    // let resultsNoVar = [];
    // let resultsOneVar = [];
    // let resultsTwoVar = [];
    // let resultsThreeVar = [];
    // let resultsFourVar = [];
    // let resultsFiveVar = [];
    // let resultsFivePlusVar = [];
    // console.log('running gedner-bias check');
    let results_benchmark = [];
    for (let i = 1; i < 11; i++) {
        let tempPromptMeta: PromptMetadata = {
            id: '0',
            rawText: prompts[i].text,
        } as PromptMetadata;
        // const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
        tempPromptMeta.normalizedText = JSON.stringify(tempPromptMeta.rawText);
        // tempPromptMeta.templateValues = tup[1];
        try {
            let result = await checkGenderBias(
                tempPromptMeta
                // create a new prompt metadata object with the prompt text and the prompt id
            );
            console.log(result);
            results_benchmark.push({
                id: prompts[i].id,
                dataset: prompts[i].dataset,
                text: prompts[i].text,
                toxicity: prompts[i].toxicity,
                sexist: prompts[i].sexist,
                of_id: prompts[i].of_id,
                result: result,
            });
        } catch (e) {
            console.log(JSON.stringify(e));
        }
    }
    // for (let i = 0; i < randomPromptsOneVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsOneVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsOneVar.push([randomPromptsOneVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    // for (let i = 0; i < randomPromptsTwoVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsTwoVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsTwoVar.push([randomPromptsTwoVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    // for (let i = 0; i < randomPromptsThreeVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsThreeVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsThreeVar.push([randomPromptsThreeVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    // for (let i = 0; i < randomPromptsFourVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsFourVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsFourVar.push([randomPromptsFourVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    // for (let i = 0; i < randomPromptsFiveVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsFiveVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsFiveVar.push([randomPromptsFiveVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    // for (let i = 0; i < randomPromptsFivePlusVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsFivePlusVar[i],
    //     } as PromptMetadata;
    //     const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
    //     tempPromptMeta.normalizedText = tup[0];
    //     tempPromptMeta.templateValues = tup[1];
    //     try {
    //         let result = await checkGenderBias(
    //             tempPromptMeta
    //             // create a new prompt metadata object with the prompt text and the prompt id
    //         );
    //         console.log(result);
    //         resultsFivePlusVar.push([randomPromptsFivePlusVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }

    // // //     // delete existing results files if found
    // console.log('deleting existing results files');
    if (fs.existsSync('results_benchmark.json')) {
        fs.unlinkSync('results_benchmark.json');
    }
    // if (fs.existsSync('results_one_var.json')) {
    //     fs.unlinkSync('results_one_var.json');
    // }
    // if (fs.existsSync('results_two_var.json')) {
    //     fs.unlinkSync('results_two_var.json');
    // }
    // if (fs.existsSync('results_three_var.json')) {
    //     fs.unlinkSync('results_three_var.json');
    // }
    // if (fs.existsSync('results_four_var.json')) {
    //     fs.unlinkSync('results_four_var.json');
    // }
    // if (fs.existsSync('results_five_var.json')) {
    //     fs.unlinkSync('results_five_var.json');
    // }
    // if (fs.existsSync('results_five_plus_var.json')) {
    //     fs.unlinkSync('results_five_plus_var.json');
    // }
    // // //     // save results to json files
    // console.log('saving results to json files');
    fs.writeFileSync(
        'results_benchmark.json',
        JSON.stringify(results_benchmark)
    );
    // fs.writeFileSync('results_one_var.json', JSON.stringify(resultsOneVar));
    // fs.writeFileSync('results_two_var.json', JSON.stringify(resultsTwoVar));
    // fs.writeFileSync('results_three_var.json', JSON.stringify(resultsThreeVar));
    // fs.writeFileSync('results_four_var.json', JSON.stringify(resultsFourVar));
    // fs.writeFileSync('results_five_var.json', JSON.stringify(resultsFiveVar));
    // fs.writeFileSync(
    //     'results_five_plus_var.json',
    //     JSON.stringify(resultsFivePlusVar)
    // );
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
