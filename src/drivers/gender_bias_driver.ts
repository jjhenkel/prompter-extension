// this is a driver program that allows us to use the different modules directly for batch processing

// import the modules

import { exit } from 'process';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
import { PromptMetadata, PromptTemplateHole } from '../modules/prompt-finder';
import { canonizeStringWithLLM } from '../modules/prompt-finder/canonization';
// import { getClient } from '../modules/LLMUtils';
import * as LLMUtils from '../modules/LLMUtils'; // Add this line to import the LLMUtils module
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

async function processGenderBiasPromptSetCheck(
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
        let result = await checkGenderBias(
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
    // if API key not defined in current LLMConfig, ask for API key in console
    // if (
    //     getAPIKey() === undefined ||
    //     getAPIKey() === '' ||
    //     getAPIKey() === null
    // ) {
    //     console.log('API key not found in LLMConfig. ');
    //     const apiKey = await readFromConsole(
    //         'Please enter your OpenAI API key: '
    //     );
    //     setAPIKey(apiKey);
    // }

    // if (
    //     getEndpoint() === undefined ||
    //     getEndpoint() === '' ||
    //     getEndpoint() === null
    // ) {
    //     console.log('Endpoint not found in LLMConfig. ');
    //     const endpoint = await readFromConsole(
    //         'Please enter your OpenAI Endpoint: '
    //     );
    //     setEndpoint(endpoint);
    // }

    // print current working directory
    // console.log('current working directory: ', __dirname);
    // exit()
    // const data = fs.readFileSync(
    //     __dirname + '/../../data/runnable_prompts_ascii.json',
    //     'utf8'
    // );
    // const prompts = JSON.parse(data);

    // randomly select x prompts from prompt list
    // console.log('selecting random prompts');
    // const x = 5;
    const randomPromptsNoVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_no_var.json', 'utf8')
    );
    console.log('randomPromptsNoVar:', randomPromptsNoVar.length);
    const randomPromptsOneVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_one_var.json', 'utf8')
    );
    console.log('randomPromptsOneVar:', randomPromptsOneVar.length);
    const randomPromptsTwoVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_two_var.json', 'utf8')
    );
    console.log('randomPromptsTwoVar:', randomPromptsTwoVar.length);
    const randomPromptsThreeVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_three_var.json', 'utf8')
    );
    console.log('randomPromptsThreeVar:', randomPromptsThreeVar.length);
    const randomPromptsFourVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_four_var.json', 'utf8')
    );
    console.log('randomPromptsFourVar:', randomPromptsFourVar.length);
    const randomPromptsFiveVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_five_var.json', 'utf8')
    );
    console.log('randomPromptsFiveVar:', randomPromptsFiveVar.length);
    const randomPromptsFivePlusVar: string[] = JSON.parse(
        fs.readFileSync('../../data/random_prompts_five_plus_var.json', 'utf8')
    );
    console.log('randomPromptsFivePlusVar:', randomPromptsFivePlusVar.length);

    //     // run variable injection check on each prompt set
    let resultsNoVar = [];
    let resultsOneVar = [];
    let resultsTwoVar = [];
    let resultsThreeVar = [];
    let resultsFourVar = [];
    let resultsFiveVar = [];
    let resultsFivePlusVar = [];
    console.log('running gender-bias check');
    // for (let i = 0; i < randomPromptsNoVar.length; i++) {
    //     let tempPromptMeta: PromptMetadata = {
    //         id: '0',
    //         rawText: randomPromptsNoVar[i],
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
    //         resultsNoVar.push([randomPromptsOneVar[i], result]);
    //     } catch (e) {
    //         console.log(JSON.stringify(e));
    //     }
    // }
    const genderCheckPromises_0 = randomPromptsNoVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });

    resultsNoVar = await Promise.all(genderCheckPromises_0);
    if (
        fs.existsSync('./results/gender-bias-check-patched/results_no_var.json')
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_no_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_no_var.json',
        JSON.stringify(resultsNoVar)
    );
    console.log('results for no var done');
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
    const genderCheckPromises_1 = randomPromptsOneVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });
    resultsOneVar = await Promise.all(genderCheckPromises_1);
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_one_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_one_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_one_var.json',
        JSON.stringify(resultsOneVar)
    );
    console.log('results for one var done');
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
    const genderCheckPromises_2 = randomPromptsTwoVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });
    resultsTwoVar = await Promise.all(genderCheckPromises_2);
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_two_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_two_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_two_var.json',
        JSON.stringify(resultsTwoVar)
    );
    console.log('results for two var done');
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
    const genderCheckPromises_3 = randomPromptsThreeVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });
    resultsThreeVar = await Promise.all(genderCheckPromises_3);
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_three_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_three_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_three_var.json',
        JSON.stringify(resultsThreeVar)
    );
    console.log('results for three var done');
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
    const genderCheckPromises_4 = randomPromptsFourVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });
    resultsFourVar = await Promise.all(genderCheckPromises_4);
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_four_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_four_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_four_var.json',
        JSON.stringify(resultsFourVar)
    );
    console.log('results for four var done');
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
    const genderCheckPromises_5 = randomPromptsFiveVar.map(async (prompt) => {
        return await processGenderBiasPromptSetCheck(prompt, ids_generated);
    });
    resultsFiveVar = await Promise.all(genderCheckPromises_5);
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_five_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_five_var.json'
        );
    }
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_five_var.json',
        JSON.stringify(resultsFiveVar)
    );
    console.log('results for five var done');
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
    if (
        fs.existsSync(
            './results/gender-bias-check-patched/results_five_plus_var.json'
        )
    ) {
        fs.unlinkSync(
            './results/gender-bias-check-patched/results_five_plus_var.json'
        );
    }
    const genderCheckPromises_6 = randomPromptsFivePlusVar.map(
        async (prompt) => {
            return await processGenderBiasPromptSetCheck(prompt, ids_generated);
        }
    );
    resultsFivePlusVar = await Promise.all(genderCheckPromises_6);
    fs.writeFileSync(
        './results/gender-bias-check-patched/results_five_plus_var.json',
        JSON.stringify(resultsFivePlusVar)
    );
    console.log('results for five plus var done');
    // //     // delete existing results files if found
    // console.log('deleting existing results files');

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
