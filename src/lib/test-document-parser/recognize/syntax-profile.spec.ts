import { DocLine } from '../types/document-model';
import { ParseStatus, QuestionRejectionReason } from '../types/parse-result';
import { assembleTestDocument } from './assemble';
import { segmentQuestions } from './segment';
import { recognizeDocumentSyntax } from './syntax-profile';

function line(text: string): DocLine {
	return {
		page: 1,
		y: 700,
		x0: 50,
		x1: 250,
		size: 12,
		text,
		boldFrac: 0,
		italicFrac: 0,
		color: null,
		highlightFrac: 0,
		gapBefore: 10
	};
}

function question(text: string, options: string[]): DocLine[] {
	return [line(`${text} {`), ...options.map(line), line('}')];
}

describe('document syntax profile', () => {
	test('infers the global profile and applies local question grammars separately', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Percentage', ['~%50%first', '~%-50%second', '~%-50%third']),
			...question('Matching', ['=left->right', '=other->pair'])
		]);
		if (!document) throw new Error('Document was not segmented');

		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');

		expect(recognized.profile).toMatchObject({
			structure: { kind: 'bracket' },
			answerMarker: { symbolPrefix: '=' },
			localGrammars: { percentage: true, matching: true }
		});
		expect(recognized.questions.map(result => result.kind)).toEqual([
			'choice',
			'choice',
			'choice',
			'matching'
		]);
		expect(recognized.questions[2]).toMatchObject({ grammar: 'percentage' });
	});

	test('rejects a nonconforming question without losing a confirmed document profile', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Without answer', ['~wrong', '~also wrong', '~third wrong'])
		]);
		if (!document) throw new Error('Document was not segmented');

		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');

		expect(recognized.questions[2]).toMatchObject({
			kind: 'rejected',
			reason: QuestionRejectionReason.NO_ANSWER_MARKER
		});
	});

	test('keeps percentage-looking text after a confirmed equals marker', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Literal percent', ['=%50% is answer text', '~wrong', '~also wrong'])
		]);
		if (!document) throw new Error('Document was not segmented');
		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');
		const result = assembleTestDocument(document, recognized.questions);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');
		const literal = result.document.questions[2];
		if (literal.type === 'matching') throw new Error('Unexpected matching question');

		expect(recognized.questions[2]).toMatchObject({
			kind: 'choice',
			grammar: 'document',
			consumedTextPrefixes: [null, null, null]
		});
		expect(literal.options[0]).toEqual({
			index: 1,
			text: '%50% is answer text',
			isCorrect: true
		});
	});
});
