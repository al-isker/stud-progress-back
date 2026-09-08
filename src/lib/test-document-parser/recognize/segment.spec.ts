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

	test('keeps an unconfirmed standalone symbol as an option continuation', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [
				['=correct'],
				['~first line'],
				['+continuation'],
				['~wrong']
			]),
			...bracketQuestion('Question 2', [['~wrong'], ['=correct'], ['~also wrong']])
		]);

		expect(questions[0].options).toHaveLength(3);
		expect(questions[0].options[1]).toMatchObject({
			sourcePrefix: '~',
			structuralPrefix: '~',
			texts: ['first line', '+continuation']
		});
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

	test('rejects a visually compatible question block separated by a paragraph gap', () => {
		const firstLine = { ...line('First question line'), gapBefore: 30 };
		const openingLine = { ...line('second question line {'), gapBefore: 30 };
		const questions = segment([
			...bracketQuestion('Control question', [['=left'], ['=right']]),
			firstLine,
			openingLine,
			line('=left->right'),
			line('=other->pair'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['First question line', 'second question line']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('keeps a visually compatible question block across a page boundary', () => {
		const firstLine = {
			...line('First question line'),
			page: 1,
			y: 40,
			x0: 90,
			gapBefore: 12
		};
		const openingLine = {
			...line('Second question line {'),
			page: 2,
			y: 700,
			gapBefore: null
		};
		const questions = segment([
			firstLine,
			openingLine,
			{ ...line('=left->right'), page: 2 },
			{ ...line('=other->pair'), page: 2 },
			{ ...line('}'), page: 2 }
		]);

		expect(questions[0].texts).toEqual(['First question line', 'Second question line']);
		expect(questions[0].rejectionReason).toBeUndefined();
	});

	test('rejects but preserves a same-page lead with contradictory spacing and indentation', () => {
		const questions = segment([
			...bracketQuestion('Control question', [['=left'], ['=right']]),
			{ ...line('First question line'), x0: 50, gapBefore: 30 },
			{ ...line('second question line {'), x0: 90, gapBefore: 30 },
			line('=left->right'),
			line('=other->pair'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['First question line', 'second question line']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('keeps a multiline question across a page boundary before a standalone opener', () => {
		const questions = segment([
			...bracketQuestion('Previous question', [['=correct'], ['~wrong']]),
			{ ...line('First question line'), page: 1, y: 40, boldFrac: 1, gapBefore: 30 },
			{
				...line('second question line'),
				page: 2,
				y: 700,
				boldFrac: 1,
				gapBefore: null
			},
			{ ...line('{'), page: 2 },
			{ ...line('=correct'), page: 2 },
			{ ...line('~wrong'), page: 2 },
			{ ...line('}'), page: 2 }
		]);

		expect(questions[1].texts).toEqual(['First question line', 'second question line']);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('keeps differently indented lines inside one question text block', () => {
		const firstLine = { ...line('First question line'), x0: 90, gapBefore: 30 };
		const openingLine = { ...line('Second question line {'), x0: 50, gapBefore: 10 };
		const questions = segment([
			firstLine,
			openingLine,
			line('=left->right'),
			line('=other->pair'),
			line('}')
		]);

		expect(questions[0].texts).toEqual(['First question line', 'Second question line']);
		expect(questions[0].rejectionReason).toBeUndefined();
	});

	test('does not attach a clearly separate visual block to a question', () => {
		const heading = {
			...line('Section heading'),
			x0: 30,
			size: 16,
			boldFrac: 1,
			gapBefore: 30
		};
		const openingLine = { ...line('Question {'), gapBefore: 30 };
		const questions = segment([
			heading,
			openingLine,
			line('=left->right'),
			line('=other->pair'),
			line('}')
		]);

		expect(questions[0].texts).toEqual(['Question']);
		expect(questions[0].rejectionReason).toBeUndefined();
	});

	test('does not delete repeated styled paragraphs as presumed metadata', () => {
		const section = (text: string, question: string): DocLine[] => [
			{ ...line(text), italicFrac: 1, gapBefore: 24 },
			{ ...line(`${question} {`), gapBefore: 24 },
			{ ...line('=correct'), gapBefore: 24 },
			{ ...line('~wrong'), gapBefore: 24 },
			{ ...line('}'), gapBefore: 24 }
		];
		const questions = segment([
			...section('First metadata', 'Question one'),
			...section('Different metadata', 'Question two'),
			...bracketQuestion('Control question', [['=correct'], ['~wrong']])
		]);

		expect(questions.slice(0, 2).map(question => question.texts)).toEqual([
			['First metadata', 'Question one'],
			['Different metadata', 'Question two']
		]);
		expect(questions.slice(0, 2).map(question => question.rejectionReason)).toEqual([
			QuestionRejectionReason.MALFORMED_STRUCTURE,
			QuestionRejectionReason.MALFORMED_STRUCTURE
		]);
	});

	test('does not delete a styled paragraph at a percentage grammar transition', () => {
		const questions = segment([
			...bracketQuestion('Ordinary question', [['=correct'], ['~wrong']]).map(current => ({
				...current,
				gapBefore: 24
			})),
			{ ...line('Section metadata'), italicFrac: 1, gapBefore: 24 },
			{ ...line('Percentage question {'), gapBefore: 24 },
			{ ...line('~%50%first'), gapBefore: 24 },
			{ ...line('~%50%second'), gapBefore: 24 },
			{ ...line('~%-100%third'), gapBefore: 24 },
			{ ...line('}'), gapBefore: 24 }
		]);

		expect(questions[1].texts).toEqual(['Section metadata', 'Percentage question']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('rejects and preserves an unconfirmed visual prefix at the document boundary', () => {
		const questions = segment([
			{ ...line('Ambiguous prefix'), boldFrac: 1, gapBefore: null },
			line('Question body {'),
			line('=correct'),
			line('~wrong'),
			line('}'),
			...bracketQuestion('Control question', [['=correct'], ['~wrong']])
		]);

		expect(questions[0].texts).toEqual(['Ambiguous prefix', 'Question body']);
		expect(questions[0].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('rejects a question stem attached to the previous closing delimiter', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line('} Question 2'),
			line('{'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions).toHaveLength(2);
		expect(questions[1].texts).toEqual(['Question 2']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('rejects a multiline question stem attached to the previous closing delimiter', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line('} First line of question 2'),
			line('second line of question 2'),
			line('{'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['First line of question 2', 'second line of question 2']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('rejects an inline question and opener attached to the previous closing delimiter', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line('} Question 2 {'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['Question 2']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('accepts a question stem that starts on a separate line after the previous block', () => {
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line('}'),
			line('First line of question 2'),
			line('second line of question 2'),
			line('{'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['First line of question 2', 'second line of question 2']);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('rejects a recognizable question without an opening delimiter', () => {
		const questions = segment([
			line('Malformed question without opening delimiter'),
			line('=answer'),
			line('=other answer'),
			line('}'),
			...bracketQuestion('Next question', [['=left->right'], ['=other->pair']])
		]);

		expect(questions).toHaveLength(2);
		expect(questions[0]).toMatchObject({
			texts: ['Malformed question without opening delimiter'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
		expect(questions[1].texts).toEqual(['Next question']);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('keeps the complete malformed question lead across a page boundary', () => {
		const questions = segment([
			{ ...line('First line of malformed question'), page: 1, y: 40 },
			{ ...line('second line of malformed question'), page: 2, y: 700, gapBefore: null },
			{ ...line('=answer'), page: 2 },
			{ ...line('=other answer'), page: 2 },
			{ ...line('}'), page: 2 },
			...bracketQuestion('Next question', [['=left->right'], ['=other->pair']])
		]);

		expect(questions[0]).toMatchObject({
			texts: ['First line of malformed question', 'second line of malformed question'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
		expect(questions[1].texts).toEqual(['Next question']);
	});

	test('uses the document line gap when preserving a malformed multiline lead', () => {
		const spacedLine = (text: string): DocLine => ({ ...line(text), gapBefore: 24 });
		const questions = segment([
			{ ...spacedLine('First line of malformed question'), gapBefore: 48 },
			spacedLine('second line of malformed question'),
			spacedLine('=answer'),
			spacedLine('=other answer'),
			spacedLine('}'),
			spacedLine('Next question {'),
			spacedLine('=left->right'),
			spacedLine('=other->pair'),
			spacedLine('}')
		]);

		expect(questions[0]).toMatchObject({
			texts: ['First line of malformed question', 'second line of malformed question'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
		expect(questions[1].texts).toEqual(['Next question']);
	});

	test('rejects a recognizable question whose opening delimiter is a closing delimiter', () => {
		const questions = segment([
			line('Malformed question'),
			line('}'),
			line('=answer'),
			line('=other answer'),
			line('}'),
			...bracketQuestion('Next question', [['=left->right'], ['=other->pair']])
		]);

		expect(questions).toHaveLength(2);
		expect(questions[0]).toMatchObject({
			texts: ['Malformed question'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
		expect(questions[1].texts).toEqual(['Next question']);
	});

	test('rejects a recognizable question that starts after an unmatched closing delimiter', () => {
		const questions = segment([
			line('} Malformed question'),
			line('=answer'),
			line('=other answer'),
			line('}'),
			...bracketQuestion('Next question', [['=left->right'], ['=other->pair']])
		]);

		expect(questions).toHaveLength(2);
		expect(questions[0]).toMatchObject({
			texts: ['Malformed question'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
		expect(questions[1].texts).toEqual(['Next question']);
	});

	test('rejects a bracket question that is not closed at the end of the document', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=correct 1'], ['~wrong 1']]),
			line('Question 2 {'),
			line('=correct 2'),
			line('~wrong 2')
		]);

		expect(questions).toHaveLength(2);
		expect(questions[1]).toMatchObject({
			texts: ['Question 2'],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
	});

	test('does not invent a malformed question from one option-like line', () => {
		const questions = segment([
			line('Unrecognized debris'),
			line('=one option'),
			line('}'),
			...bracketQuestion('Next question', [['=left->right'], ['=other->pair']])
		]);

		expect(questions).toHaveLength(1);
		expect(questions[0].texts).toEqual(['Next question']);
	});

	test.each(['.', 'l'])('does not attach detached %s debris to the next question', debris => {
		const nextQuestion = { ...line('Next question'), gapBefore: 30 };
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line(`} ${debris}`),
			nextQuestion,
			line('{'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions).toHaveLength(2);
		expect(questions[1].texts).toEqual(['Next question']);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('rejects an ambiguous long fragment instead of accepting a truncated next question', () => {
		const nextQuestion = { ...line('Next question'), gapBefore: 30 };
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			line('} ambiguous fragment'),
			nextQuestion,
			line('{'),
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['ambiguous fragment', 'Next question']);
		expect(questions[1].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
	});

	test('ignores post-delimiter debris that is visually separate from the next question', () => {
		const closingLine = {
			...line('} unrelated debris'),
			x0: 20,
			size: 16,
			boldFrac: 1
		};
		const nextQuestion = { ...line('Next question {'), gapBefore: 30 };
		const questions = segment([
			line('Question 1 {'),
			line('=correct 1'),
			line('~wrong 1'),
			closingLine,
			nextQuestion,
			line('=correct 2'),
			line('~wrong 2'),
			line('}')
		]);

		expect(questions[1].texts).toEqual(['Next question']);
		expect(questions[1].rejectionReason).toBeUndefined();
	});

	test('does not let an unclosed block define document option syntax', () => {
		const document = segmentQuestions([
			...bracketQuestion('Question 1', [['=answer 1'], ['=answer 2']]),
			...bracketQuestion('Question 2', [['=answer 1'], ['=answer 2']]),
			line('Malformed question {'),
			line('!answer 1'),
			line('!answer 2')
		]);

		expect(document?.structure.kind).toBe('bracket');
		if (document?.structure.kind !== 'bracket') throw new Error('Expected bracket structure');
		expect([...document.structure.options.prefixByFamily.entries()]).toEqual([['=', '=']]);
		expect(document.questions[2]).toMatchObject({
			texts: ['Malformed question'],
			options: [],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
	});

	test('does not let a block attached to the previous closing delimiter define option syntax', () => {
		const document = segmentQuestions([
			line('Question 1 {'),
			line('=answer 1'),
			line('=answer 2'),
			line('} Malformed question {'),
			line('!answer 1'),
			line('!answer 2'),
			line('}')
		]);

		expect(document?.structure.kind).toBe('bracket');
		if (document?.structure.kind !== 'bracket') throw new Error('Expected bracket structure');
		expect([...document.structure.options.prefixByFamily.entries()]).toEqual([['=', '=']]);
		expect(document.questions[1]).toMatchObject({
			texts: ['Malformed question'],
			options: [],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		});
	});

	test('does not fall back to another scheme when every bracket block is malformed', () => {
		const document = segmentQuestions([
			line('Question 1 {'),
			line('=answer 1'),
			line('~other 1'),
			line('~other 2'),
			line('Question 2 {'),
			line('=answer 2'),
			line('~other 1'),
			line('~other 2'),
			line('}')
		]);

		expect(document).toBeNull();
	});

	test('rejects content between the opening delimiter and the first option', () => {
		const questions = segment([
			line('Question {'),
			line('orphan content'),
			line('=correct'),
			line('~wrong'),
			line('}')
		]);

		expect(questions[0].texts).toEqual(['Question']);
		expect(questions[0].options).toHaveLength(2);
		expect(questions[0].rejectionReason).toBe(QuestionRejectionReason.MALFORMED_STRUCTURE);
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
