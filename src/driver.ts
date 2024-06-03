// this is a driver program that allows us to use the different modules directly for batch processing

// import the modules

import { exit } from 'process';
import checkGenderBias from './modules/bias-modules/gender-bias-module';
import { PromptMetadata } from './modules/prompt-finder';
import { canonizeStringWithLLM } from './modules/prompt-finder/canonization';
import {
    getAPIKey,
    getClient,
    getEndpoint,
    setAPIKey,
    setEndpoint,
} from './modules/LLMUtils';
import readline from 'readline';
// load the data from the json file

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
    getClient();
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

    // print current working directory
    // console.log('current working directory: ', __dirname);
    // exit()
    const data = fs.readFileSync(
        __dirname + '/../data/runnable_prompts_ascii.json',
        'utf8'
    );
    const prompts = JSON.parse(data);

    // randomly select x prompts from prompt list
    console.log('selecting random prompts');
    const x = 5;
    const randomPromptsOneVar: string[] = getRandomElements(
        prompts['one_variable_prompts'],
        x
    );
    const randomPromptsTwoVar: string[] = getRandomElements(
        prompts['two_variable_prompts'],
        x
    );
    const randomPromptsThreeVar: string[] = getRandomElements(
        prompts['three_variable_prompts'],
        x
    );
    const randomPromptsFourVar: string[] = getRandomElements(
        prompts['four_variable_prompts'],
        x
    );
    const randomPromptsFiveVar: string[] = getRandomElements(
        prompts['five_variable_prompts'],
        x
    );
    const randomPromptsFivePlusVar: string[] = getRandomElements(
        prompts['more_than_five_variable_prompts'],
        x
    );
    //     // run variable injection check on each prompt set
    let resultsOneVar = [];
    let resultsTwoVar = [];
    let resultsThreeVar = [];
    let resultsFourVar = [];
    let resultsFiveVar = [];
    let resultsFivePlusVar = [];
    console.log('running gedner-bias check');
    for (let i = 0; i < randomPromptsOneVar.length; i++) {
        let tempPromptMeta: PromptMetadata = {
            id: '0',
            rawText: randomPromptsOneVar[i],
        } as PromptMetadata;
        const tup = await canonizeStringWithLLM(tempPromptMeta.rawText);
        tempPromptMeta.normalizedText = tup[0];
        tempPromptMeta.templateValues = tup[1];
        try {
            let result = await checkGenderBias(
                tempPromptMeta
                // create a new prompt metadata object with the prompt text and the prompt id
            );
            console.log(result);
            resultsOneVar.push([randomPromptsOneVar[i], result]);
        } catch (e) {
            console.log(JSON.stringify(e));
        }
    }
    rl.close();
    exit();
    //     // sleep for 30 seconds to avoid rate limit
    //     console.log(' One var processed. sleeping  to avoid rate limit');
    //     await new Promise((r) => setTimeout(r, sleepDuration));
    //     for (let i = 0; i < randomPromptsTwoVar.length; i++) {
    //         try {
    //             let result = await checkGenderBias(randomPromptsTwoVar[i]);
    //             resultsTwoVar.push([randomPromptsTwoVar[i], result]);
    //         } catch (e) {
    //             console.log(JSON.stringify(e));
    //         }
    //     }
    // //     // sleep for 30 seconds to avoid rate limit
    // //     console.log(' Two var processed. sleeping  to avoid rate limit');
    // //     await new Promise((r) => setTimeout(r, sleepDuration));
    //     for (let i = 0; i < randomPromptsThreeVar.length; i++) {
    //         try {
    //             let result = await checkGenderBias(randomPromptsThreeVar[i]);
    //             resultsThreeVar.push([randomPromptsThreeVar[i], result]);
    //         } catch (e) {
    //             console.log(JSON.stringify(e));
    //         }
    //     }
    // //     // sleep for 30 seconds to avoid rate limit
    // //     console.log(' Three var processed. sleeping  to avoid rate limit');
    // //     await new Promise((r) => setTimeout(r, sleepDuration));
    //     for (let i = 0; i < randomPromptsFourVar.length; i++) {
    //         try {
    //             let result = await checkGenderBias(randomPromptsFourVar[i]);
    //             resultsFourVar.push([randomPromptsFourVar[i], result]);
    //         } catch (e) {
    //             console.log(JSON.stringify(e));
    //         }
    //     }
    // //     // sleep for 30 seconds to avoid rate limit
    // //     console.log(' Four var processed. sleeping  to avoid rate limit');
    // //     await new Promise((r) => setTimeout(r, sleepDuration));
    //     for (let i = 0; i < randomPromptsFiveVar.length; i++) {
    //         try {
    //             let result = await checkGenderBias(randomPromptsFiveVar[i]);
    //             resultsFiveVar.push([randomPromptsFiveVar[i], result]);
    //         } catch (e) {
    //             console.log(JSON.stringify(e));
    //         }
    //     }
    // //     // sleep for 30 seconds to avoid rate limit
    // //     // console.log(" Five var processed. sleeping  to avoid rate limit");
    //     // await new Promise(r => setTimeout(r, sleepDuration));
    //     for (let i = 0; i < randomPromptsFivePlusVar.length; i++) {
    //         try {
    //             let result = await checkGenderBias(randomPromptsFivePlusVar[i]);
    //             resultsFivePlusVar.push([randomPromptsFivePlusVar[i], result]);
    //         }
    //         catch (e) {
    //             console.log(JSON.stringify(e));
    //         }
    //     }
    // //     // delete existing results files if found
    //     console.log('deleting existing results files');
    //     if (fs.existsSync('results_one_var.json')) {
    //         fs.unlinkSync('results_one_var.json');
    //     }
    //     if (fs.existsSync('results_two_var.json')) {
    //         fs.unlinkSync('results_two_var.json');
    //     }
    //     if (fs.existsSync('results_three_var.json')) {
    //         fs.unlinkSync('results_three_var.json');
    //     }
    //     if (fs.existsSync('results_four_var.json')) {
    //         fs.unlinkSync('results_four_var.json');
    //     }
    //     if (fs.existsSync('results_five_var.json')) {
    //         fs.unlinkSync('results_five_var.json');
    //     }
    //     if (fs.existsSync('results_five_plus_var.json')) {
    //         fs.unlinkSync('results_five_plus_var.json');
    //     }
    // //     // save results to json files
    //     console.log('saving results to json files');
    //     fs.writeFileSync('results_one_var.json', JSON.stringify(resultsOneVar));
    //     fs.writeFileSync('results_two_var.json', JSON.stringify(resultsTwoVar));
    //     fs.writeFileSync('results_three_var.json', JSON.stringify(resultsThreeVar));
    //     fs.writeFileSync('results_four_var.json', JSON.stringify(resultsFourVar));
    //     fs.writeFileSync('results_five_var.json', JSON.stringify(resultsFiveVar));
    //     fs.writeFileSync('results_five_plus_var.json', JSON.stringify(resultsFivePlusVar));
    //     console.log('done');
    // }
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
