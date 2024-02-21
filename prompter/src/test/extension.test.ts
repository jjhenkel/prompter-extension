import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import checkGenderBias from '../modules/bias-modules/gender-bias-module';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
	test('Simple Bias Test', async () => {
		const text = " Write the description of a protagnist's love interest ";
		const result: any = await checkGenderBias(text);
		console.log(result);
		assert.strictEqual(result.may_cause_gender_bias, true);
	});
});
