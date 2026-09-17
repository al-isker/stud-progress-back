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
			answerMarker: { symbolPrefix: '=' }
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

	test('keeps unconfirmed percent and plus symbols as answer content', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Literal percent', ['=%50% is answer text', '~wrong', '~also wrong']),
			...question('Literal plus', ['=correct', '~+wrong with plus', '~also wrong'])
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
		const plus = result.document.questions[3];
		if (plus.type === 'matching') throw new Error('Unexpected matching question');
		expect(plus.options[1].text).toBe('+wrong with plus');
	});

	test('uses a confirmed document marker as a veto for percentage answers', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Conflicting percentage', [
				'~%100%percentage answer',
				'=%0%document-marker answer',
				'~%0%wrong'
			])
		]);
		if (!document) throw new Error('Document was not segmented');

		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');

		expect(recognized.questions[2]).toMatchObject({
			kind: 'rejected',
			reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER
		});
	});

	test('accepts a percentage answer when an active document marker agrees', () => {
		const document = segmentQuestions([
			...question('Choice 1', ['=correct', '~wrong', '~also wrong']),
			...question('Choice 2', ['~wrong', '=correct', '~also wrong']),
			...question('Agreeing percentage', ['=%100%agreed answer', '~%0%wrong', '~%0%also wrong'])
		]);
		if (!document) throw new Error('Document was not segmented');

		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');

		expect(recognized.questions[2]).toMatchObject({
			kind: 'choice',
			grammar: 'percentage',
			marked: [true, false, false]
		});
	});

	test('does not let questions with duplicate options define the document marker', () => {
		const document = segmentQuestions([
			...question('Valid 1', ['=+correct', '=wrong', '=also wrong']),
			...question('Valid 2', ['=wrong', '=+correct', '=also wrong']),
			...question('Duplicate 1', ['=same', '=same', '=other']),
			...question('Duplicate 2', ['=same', '=same', '=other']),
			...question('Duplicate 3', ['=same', '=same', '=other'])
		]);
		if (!document) throw new Error('Document was not segmented');
		for (let questionIndex = 2; questionIndex < 5; questionIndex++) {
			document.questions[questionIndex].options[0].lines[0].highlightFrac = 1;
		}

		const recognized = recognizeDocumentSyntax(document);
		if (!recognized) throw new Error('Document syntax was not recognized');

		expect(recognized.profile.answerMarker).toMatchObject({
			symbolPrefix: '=+',
			signals: [{ kind: 'symbol', prefix: '=+' }]
		});
		expect(recognized.questions.map(result => result.kind)).toEqual([
			'choice',
			'choice',
			'rejected',
			'rejected',
			'rejected'
		]);
		for (const result of recognized.questions.slice(2)) {
			expect(result).toMatchObject({
				kind: 'rejected',
				reason: QuestionRejectionReason.DUPLICATE_OPTIONS
			});
		}
	});

	test('does not let an option emptied by a confirmed marker define that marker', () => {
		const document = segmentQuestions([
			...question('Valid marked question', ['=+correct', '=wrong', '=also wrong']),
			...question('Empty marked option', ['=+', '=wrong', '=also wrong']),
			...question('Question without a marker', ['=wrong', '=also wrong', '=third wrong'])
		]);
		if (!document) throw new Error('Document was not segmented');

		expect(recognizeDocumentSyntax(document)).toBeNull();
	});
});
