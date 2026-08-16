import { DocLine } from '../types/document-model';
import { ParseStatus, QuestionRejectionReason } from '../types/parse-result';
import { ChoiceQuestion, Question } from '../types/test-document';
import { assembleTestDocument as assembleRecognizedDocument } from './assemble';
import { OptionSyntaxProfile, RawQuestion, segmentQuestions } from './segment';
import { QuestionSyntaxResult, recognizeDocumentSyntax } from './syntax-profile';

const line = (text: string, highlightFrac = 0): DocLine => ({
	page: 1,
	y: 700,
	x0: 50,
	x1: 250,
	size: 12,
	text,
	boldFrac: 0,
	italicFrac: 0,
	color: null,
	highlightFrac,
	gapBefore: 10
});

function bracketQuestion(text: string, options: Array<[string, number?]>): DocLine[] {
	return [
		line(`${text} {`),
		...options.map(([option, highlight]) => line(option, highlight)),
		line('}')
	];
}

function segment(lines: DocLine[]): RawQuestion[] {
	const document = segmentQuestions(lines);
	if (!document) throw new Error('Questions were not segmented');

	return document.questions;
}

function choiceQuestion(question: Question): ChoiceQuestion {
	if (question.type === 'matching') throw new Error('Expected a choice question');

	return question;
}

function optionSyntax(raw: RawQuestion[]): OptionSyntaxProfile {
	const prefixByFamily = new Map<string, string>();
	for (const prefix of raw.flatMap(question =>
		question.options.flatMap(option => option.structuralPrefix ?? [])
	)) {
		prefixByFamily.set(prefix[0], prefix);
	}

	return { prefixByFamily };
}

function assembleTestDocument(
	raw: RawQuestion[],
	marks: boolean[][],
	ambiguous: Set<number>,
	consumedTextPrefixes: (string | null)[][]
) {
	const syntax: QuestionSyntaxResult[] = raw.map((question, index) => {
		const prefixes = consumedTextPrefixes[index] ?? question.options.map(() => null);
		if (ambiguous.has(index)) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER,
				consumedTextPrefixes: prefixes
			};
		}

		return marks[index]?.some(Boolean)
			? {
					kind: 'choice',
					grammar: 'document',
					marked: marks[index],
					consumedTextPrefixes: prefixes
				}
			: {
					kind: 'rejected',
					reason: QuestionRejectionReason.NO_ANSWER_MARKER,
					consumedTextPrefixes: prefixes
				};
	});

	return assembleRecognizedDocument(
		{ questions: raw, structure: { kind: 'bracket', options: optionSyntax(raw) } },
		syntax
	);
}

function recognizeMarkerForTest(raw: RawQuestion[]) {
	const recognized = recognizeDocumentSyntax({
		questions: raw,
		structure: { kind: 'bracket', options: optionSyntax(raw) }
	});
	if (!recognized) return { confirmed: false } as const;

	return {
		confirmed: true as const,
		marked: recognized.questions.map((result, index) =>
			result.kind === 'choice' ? result.marked : raw[index].options.map(() => false)
		),
		matching: recognized.questions.map(result => result.kind === 'matching'),
		ambiguous: recognized.questions.flatMap((result, index) =>
			result.kind === 'rejected' &&
			result.reason === QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER
				? [index]
				: []
		),
		consumedTextPrefixes: recognized.questions.map(result => result.consumedTextPrefixes)
	};
}

describe('document-level option syntax', () => {
	test('returns the document structure used to segment questions and options', () => {
		const bracket = segmentQuestions(bracketQuestion('Question', [['=correct'], ['~wrong']]));
		const twoPrefix = segmentQuestions([
			line('?Question 1'),
			line('!+correct'),
			line('!wrong'),
			line('?Question 2'),
			line('!wrong'),
			line('!+correct')
		]);
		const numberedLine = (text: string, gapBefore: number | null): DocLine => ({
			...line(text),
			gapBefore
		});
		const numbered = segmentQuestions([
			numberedLine('#1', 30),
			numberedLine('Question 1', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30),
			numberedLine('#2', 30),
			numberedLine('Question 2', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30)
		]);

		expect(bracket?.structure.kind).toBe('bracket');
		expect(twoPrefix?.structure).toMatchObject({ kind: 'two-prefix', questionPrefix: '?' });
		expect(numbered?.structure.kind).toBe('numbered');
	});

	test('does not treat standalone hash question numbers as a two-prefix option family', () => {
		const numberedLine = (text: string, gapBefore: number | null): DocLine => ({
			...line(text),
			gapBefore
		});
		const questions = segment([
			numberedLine('% section one', null),
			numberedLine('#1', 30),
			numberedLine('Question 1', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30),
			numberedLine('#2', 30),
			numberedLine('Question 2', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30),
			numberedLine('% section two', 30),
			numberedLine('#3', 30),
			numberedLine('Question 3', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30),
			numberedLine('#4', 30),
			numberedLine('Question 4', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30)
		]);

		expect(questions).toHaveLength(4);
		expect(questions.map(question => question.texts[0])).toEqual([
			'Question 1',
			'Question 2',
			'Question 3',
			'Question 4'
		]);
	});

	test('recognizes numbered questions after 999', () => {
		const numberedLine = (text: string, gapBefore: number | null): DocLine => ({
			...line(text),
			gapBefore
		});
		const questions = segment([
			numberedLine('#1', 30),
			numberedLine('Question 1', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30),
			numberedLine('#1000', 30),
			numberedLine('Question 1000', 10),
			numberedLine('Answer 1', 30),
			numberedLine('Answer 2', 30)
		]);

		expect(questions).toHaveLength(2);
		expect(questions.map(question => question.texts[0])).toEqual(['Question 1', 'Question 1000']);
	});

	test('preserves symbolic and signed answers after the inferred structural prefix', () => {
		const questions = segment(
			bracketQuestion('Question', [['= ordinary'], ['=%'], ['=/'], ['=/////'], ['=-5'], ['=+5']])
		);

		expect(questions[0].options.map(option => option.texts[0])).toEqual([
			'ordinary',
			'%',
			'/',
			'/////',
			'-5',
			'+5'
		]);
		expect(questions[0].options.map(option => option.structuralPrefix)).toEqual([
			'=',
			'=',
			'=',
			'=',
			'=',
			'='
		]);
	});

	test('removes a symbolic correctness marker only after document-level confirmation', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+ correct 1'], ['= wrong 1'], ['= wrong 2']]),
			...bracketQuestion('Question 2', [['= wrong 1'], ['=+ correct 2'], ['= wrong 2']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.consumedTextPrefixes).toEqual([
			['+', null, null],
			[null, '+', null]
		]);
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(question =>
				choiceQuestion(question).options.map(option => option.text)
			)
		).toEqual([
			['correct 1', 'wrong 1', 'wrong 2'],
			['wrong 1', 'correct 2', 'wrong 2']
		]);
	});

	test('allows whitespace inside a confirmed compound correctness marker', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+correct 1'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['=+correct 2'], ['=wrong 2']]),
			...bracketQuestion('Question 3', [['=wrong 1'], ['=wrong 2'], ['= +correct 3']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(questions[2].options[2]).toMatchObject({
			sourcePrefix: '=',
			structuralPrefix: '=',
			texts: ['+correct 3']
		});
		expect(marker.marked[2]).toEqual([false, false, true]);
		expect(marker.consumedTextPrefixes[2]).toEqual([null, null, '+']);

		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(choiceQuestion(result.document.questions[2]).options[2]).toEqual({
			index: 3,
			text: 'correct 3',
			isCorrect: true
		});
	});

	test('does not infer a compound marker only from its whitespace-separated form', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['= +correct 1'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['= +correct 2'], ['=wrong 2']])
		]);

		expect(recognizeMarkerForTest(questions)).toEqual({ confirmed: false });
	});

	test('confirms an answer marker present in a strict majority of questions', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+correct'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['=+correct'], ['=wrong 2']]),
			...bracketQuestion('Question 3', [['=wrong 1'], ['=wrong 2'], ['=+correct']]),
			...bracketQuestion('Question 4', [['=answer 1'], ['=answer 2'], ['=answer 3']]),
			...bracketQuestion('Question 5', [['=answer 1'], ['=answer 2'], ['=answer 3']])
		]);

		expect(recognizeMarkerForTest(questions).confirmed).toBe(true);
	});

	test('does not confirm an answer marker present in exactly half of questions', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+correct'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['=+correct'], ['=wrong 2']]),
			...bracketQuestion('Question 3', [['=answer 1'], ['=answer 2'], ['=answer 3']]),
			...bracketQuestion('Question 4', [['=answer 1'], ['=answer 2'], ['=answer 3']])
		]);

		expect(recognizeMarkerForTest(questions)).toEqual({ confirmed: false });
	});

	test('prefers a visual marker over consuming a coinciding symbolic answer', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=/', 1], ['= other 1'], ['= other 2']]),
			...bracketQuestion('Question 2', [['= other 1'], ['=/', 1], ['= other 2']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.consumedTextPrefixes).toEqual([
			[null, null, null],
			[null, null, null]
		]);
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(
				question => choiceQuestion(question).options.find(option => option.isCorrect)?.text
			)
		).toEqual(['/', '/']);
	});

	test('does not consume answer symbols beyond the confirmed marker prefix', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=<4'], ['~<32'], ['~<15'], ['~<8'], ['~normal']]),
			...bracketQuestion('Question 2', [['~<10'], ['~<9'], ['~<8'], ['=100'], ['~normal']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.consumedTextPrefixes.every(question => question.every(value => !value))).toBe(
			true
		);
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(question =>
				choiceQuestion(question).options.map(option => option.text)
			)
		).toEqual([
			['<4', '<32', '<15', '<8', 'normal'],
			['<10', '<9', '<8', '100', 'normal']
		]);
	});

	test('keeps a leading hyphenated continuation inside the previous option', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=+диафрагмально-селезеночно'),
			line('-ободочная связка'),
			line('=other'),
			line('}'),
			...bracketQuestion('Question 2', [['=other'], ['=+correct']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		const question = choiceQuestion(result.document.questions[0]);
		expect(question.options).toHaveLength(2);
		expect(question.options[0].text).toBe('диафрагмально-селезеночно-ободочная связка');
	});

	test('combines local percentage markers with the global document marker', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=correct 1'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Question 2', [['~wrong 1'], ['=correct 2'], ['~wrong 2']]),
			...bracketQuestion('Question 3', [['~wrong 1'], ['~wrong 2'], ['=correct 3']]),
			...bracketQuestion('Question 4', [
				['~%50% correct 1'],
				['~%-33.33333% wrong'],
				['~%50% correct 2']
			])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions.map(question => question.type)).toEqual([
			'single',
			'single',
			'single',
			'multiple'
		]);
		expect(choiceQuestion(result.document.questions[3]).options).toEqual([
			{ index: 1, text: 'correct 1', isCorrect: true },
			{ index: 2, text: 'wrong', isCorrect: false },
			{ index: 3, text: 'correct 2', isCorrect: true }
		]);
	});

	test('excludes percentage questions from global marker confirmation', () => {
		const percentageQuestions = Array.from({ length: 7 }, (_, index) =>
			bracketQuestion(`Percentage ${index + 1}`, [
				['~%100% correct'],
				['~%-50% wrong 1'],
				['~%-50% wrong 2']
			])
		).flat();
		const questions = segment([
			...percentageQuestions,
			...bracketQuestion('Global 1', [['=correct'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Global 2', [['~wrong 1'], ['=correct'], ['~wrong 2']]),
			...bracketQuestion('Global without answer', [['~wrong 1'], ['~wrong 2'], ['~wrong 3']])
		]);
		const marker = recognizeMarkerForTest(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.consumedTextPrefixes
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toHaveLength(9);
		expect(
			result.document.questions.slice(0, 7).every(question => question.type === 'single')
		).toBe(true);
		expect(result.issues.rejectedQuestions).toEqual([
			{
				index: 10,
				text: 'Global without answer',
				reason: QuestionRejectionReason.NO_ANSWER_MARKER
			}
		]);
	});

	test('marks a question with a premature closing brace as malformed', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=correct'),
			line('~wrong 1}'),
			line('~wrong 2'),
			line('~wrong 3'),
			line('}'),
			...bracketQuestion('Question 2', [['~wrong 1'], ['=correct'], ['~wrong 2']])
		]);

		expect(questions[0].options.map(option => option.texts[0])).toEqual(['correct', 'wrong 1']);
		expect(questions[0].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('marks a nested opening brace inside an option block as malformed', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=left->right {'),
			line('=other->pair'),
			line('}'),
			...bracketQuestion('Question 2', [['=left->right'], ['=other->pair']])
		]);

		expect(questions[0].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('preserves a non-structural opening brace inside option text', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=left: { detail'),
			line('=other'),
			line('}'),
			...bracketQuestion('Question 2', [['=left'], ['=other']])
		]);

		expect(questions[0].rejectionReason).toBeUndefined();
		expect(questions[0].options[0].texts).toEqual(['left: { detail']);
	});

	test('infers bracket option syntax when most blocks contain one answer', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=left->right'], ['=other->pair']]),
			...bracketQuestion('Question 2', [['=left->right'], ['=other->pair']]),
			...bracketQuestion('Question 3', [['=answer']]),
			...bracketQuestion('Question 4', [['=answer']]),
			...bracketQuestion('Question 5', [['=answer']])
		]);

		expect(questions.map(question => question.options.length)).toEqual([2, 2, 1, 1, 1]);
	});

	test('rejects a mixed percentage question even when equals is the global marker', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=correct'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Question 2', [['=correct'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Question 3', [['=correct'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Question 4', [
				['=all of the above'],
				['~%25% first partial answer'],
				['~%25% second partial answer']
			])
		]);
		const document = {
			questions,
			structure: { kind: 'bracket' as const, options: optionSyntax(questions) }
		};
		const syntax = recognizeDocumentSyntax(document);
		if (!syntax) throw new Error('Document syntax was not recognized');
		const result = assembleRecognizedDocument(document, syntax.questions);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toHaveLength(3);
		expect(result.issues.rejectedQuestions).toContainEqual({
			index: 4,
			text: 'Question 4',
			reason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
	});

	test('keeps a rare equals option in a document dominated by tilde options', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['~wrong 1'], ['=correct'], ['~wrong 2']]),
			...bracketQuestion('Question 2', [['~wrong 1'], ['~wrong 2'], ['~wrong 3']]),
			...bracketQuestion('Question 3', [['~wrong 1'], ['~wrong 2'], ['~wrong 3']])
		]);

		expect(questions[0].options.map(option => option.sourcePrefix)).toEqual(['~', '=', '~']);
		expect(questions[0].options.map(option => option.texts[0])).toEqual([
			'wrong 1',
			'correct',
			'wrong 2'
		]);
	});

	test('keeps percentage-scored options without a tilde prefix', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [
				['~wrong 1'],
				['%50%correct 1'],
				['~wrong 2'],
				['%50%correct 2']
			]),
			...bracketQuestion('Question 2', [['~wrong 1'], ['=correct'], ['~wrong 2']]),
			...bracketQuestion('Question 3', [['~wrong 1'], ['=correct'], ['~wrong 2']])
		]);

		expect(questions[0].options.map(option => option.sourcePrefix)).toEqual(['~', '%', '~', '%']);
		expect(questions[0].options.map(option => option.texts[0])).toEqual([
			'wrong 1',
			'50%correct 1',
			'wrong 2',
			'50%correct 2'
		]);
	});

	test('recognizes a document-wide en dash option prefix', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=correct'], ['–wrong 1'], ['–wrong 2']]),
			...bracketQuestion('Question 2', [['=correct'], ['~wrong 1'], ['~wrong 2']]),
			...bracketQuestion('Question 3', [['=correct'], ['~wrong 1'], ['~wrong 2']])
		]);

		expect(questions[0].options.map(option => option.texts[0])).toEqual([
			'correct',
			'wrong 1',
			'wrong 2'
		]);
	});

	test('splits a decorated option appended to a two-prefix question', () => {
		const questions = segment([
			line('?Question 1'),
			line('continued !+correct 1'),
			line('!wrong 1'),
			line('!wrong 2'),
			line('?Question 2'),
			line('!wrong 1'),
			line('!+correct 2'),
			line('!wrong 2')
		]);

		expect(questions[0].texts).toEqual(['Question 1', 'continued']);
		expect(questions[0].options.map(option => option.texts[0])).toEqual([
			'+correct 1',
			'wrong 1',
			'wrong 2'
		]);
		expect(questions[1].texts).toEqual(['Question 2']);
	});

	test('keeps visually compatible lines of a multiline question', () => {
		const firstLine = { ...line('First question line'), gapBefore: 30 };
		const openingLine = { ...line('second question line {'), gapBefore: 30 };
		const questions = segment([
			firstLine,
			openingLine,
			line('=left->right'),
			line('=other->pair'),
			line('}')
		]);

		expect(questions[0].texts).toEqual(['First question line', 'second question line']);
	});

	test('does not invent an option when a line has no structural prefix', () => {
		const questions = segment([
			line('Question {'),
			line('=correct'),
			line('~wrong 1'),
			line('~wrong 2'),
			line('~wrong 3'),
			line('wrong 4'),
			line('}')
		]);

		expect(questions[0].options).toHaveLength(4);
		expect(questions[0].options[3].texts).toEqual(['wrong 3', 'wrong 4']);
	});
});
