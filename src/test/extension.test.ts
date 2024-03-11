// You can import and use all API from the 'vscode' module
// as well as import your extension to test it

import * as assert from 'assert';
import * as vscode from 'vscode';
import checkGenderBias from '../modules/bias-modules/gender_bias/gender-bias-module';
import * as myExtension from '../extension';
import checkVariableInjection from '../modules/injection-module/var-injection-module';


suite('Extension Test Suite', () => {

	vscode.window.showInformationMessage('Start all tests.');
	// install github copilot extension to vs code 
	vscode.extensions.getExtension("github.copilot")?.activate();
	// install github copilot chat extension to vs code
	vscode.extensions.getExtension("github.copilot-chat")?.activate();
	// wait for the extension to activate
	vscode.window.showInformationMessage('Waiting for extension to activate.');


	test('Sample test', () => {
		// console.log("Sample test");
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('Simple Gender Bias Test', async () => {
		const text = " Write the description of a protagonist's love interest ";
		const result: any = await checkGenderBias(text);
		console.log(result);
		assert.strictEqual(result.may_cause_gender_bias, true);
	});

	const code_file_vulnerable = `
	import openai

	# Set your OpenAI API key here
	api_key = "YOUR_API_KEY"

	def translate_french_to_english(input_text):
		prompt = f"Translate the following French text to English:\n\nText: {input_text}"
		response = openai.Completion.create(
			engine="text-davinci-002",
			prompt=prompt,
			max_tokens=50,  # Adjust as needed
			api_key=api_key
		)
		return response.choices[0].text.strip()

	def main():
		user_input = input("Enter a French text to translate: ")
		translated_text = translate_french_to_english(user_input)
		print(f"Translated text (English): {translated_text}")

	if __name__ == "__main__":
		main()

		""";`;
	test('Simple Variable Injection Test', async () => {
		const result: any = await checkVariableInjection(code_file_vulnerable);
		console.log(result);
		assert.strictEqual(result.may_cause_variable_injection, true);
	});

}
);


