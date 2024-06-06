const fs = require('fs');
function getRandomElements(arr_original: string[], n: number): string[] {
    //PLACEHOLDER is not supported right now, ignoring it.
    let arr = arr_original; // .filter((item) => !item.includes('PLACEHOLDER'));
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

const data = fs.readFileSync(
    __dirname + '/../data/runnable_prompts_ascii.json',
    'utf8'
);
const prompts = JSON.parse(data);

const sample_size_0 = 378;
const sample_size_1 = 370;
const sample_size_2 = 362;
const sample_size_3 = 328;
const sample_size_4 = 282;
const sample_size_5 = 211;
const sample_size_6 = 242;

const randomPromptsNoVar: string[] = getRandomElements(
    prompts['no_variable_prompts'],
    sample_size_0
);
const randomPromptsOneVar: string[] = getRandomElements(
    prompts['one_variable_prompts'],
    sample_size_1
);
const randomPromptsTwoVar: string[] = getRandomElements(
    prompts['two_variable_prompts'],
    sample_size_2
);
const randomPromptsThreeVar: string[] = getRandomElements(
    prompts['three_variable_prompts'],
    sample_size_3
);
const randomPromptsFourVar: string[] = getRandomElements(
    prompts['four_variable_prompts'],
    sample_size_4
);
const randomPromptsFiveVar: string[] = getRandomElements(
    prompts['five_variable_prompts'],
    sample_size_5
);
const randomPromptsFivePlusVar: string[] = getRandomElements(
    prompts['more_than_five_variable_prompts'],
    sample_size_6
);

// write random prompts to file
console.log(randomPromptsNoVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_no_var.json',
    JSON.stringify(randomPromptsNoVar)
);

console.log(randomPromptsOneVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_one_var.json',
    JSON.stringify(randomPromptsOneVar)
);

console.log(randomPromptsTwoVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_two_var.json',
    JSON.stringify(randomPromptsTwoVar)
);

console.log(randomPromptsThreeVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_three_var.json',
    JSON.stringify(randomPromptsThreeVar)
);

console.log(randomPromptsFourVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_four_var.json',
    JSON.stringify(randomPromptsFourVar)
);

console.log(randomPromptsFiveVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_five_var.json',
    JSON.stringify(randomPromptsFiveVar)
);

console.log(randomPromptsFivePlusVar.length);
fs.writeFileSync(
    __dirname + '/../data/random_prompts_five_plus_var.json',
    JSON.stringify(randomPromptsFivePlusVar)
);
