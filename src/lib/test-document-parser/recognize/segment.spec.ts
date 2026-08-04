import { DocLine } from '../types/document-model';
import { ParseStatus } from '../types/parse-result';
import { assembleTestDocument } from './assemble';
import { resolveAnswerMarker } from './detect-marker';
import { RawQuestion, segmentQuestions } from './segment';

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
	const questions = segmentQuestions(lines);
	if (!questions) throw new Error('Questions were not segmented');

	return questions;
}

describe('document-level option syntax', () => {
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
		const marker = resolveAnswerMarker(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.symbolPrefix).toBe('=+');
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.symbolPrefix
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(question => question.options.map(option => option.text))
		).toEqual([
			['correct 1', 'wrong 1', 'wrong 2'],
			['wrong 1', 'correct 2', 'wrong 2']
		]);
	});

	test('confirms an answer marker present in a strict majority of questions', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+correct'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['=+correct'], ['=wrong 2']]),
			...bracketQuestion('Question 3', [['=wrong 1'], ['=wrong 2'], ['=+correct']]),
			...bracketQuestion('Question 4', [['=answer 1'], ['=answer 2'], ['=answer 3']]),
			...bracketQuestion('Question 5', [['=answer 1'], ['=answer 2'], ['=answer 3']])
		]);

		expect(resolveAnswerMarker(questions).confirmed).toBe(true);
	});

	test('does not confirm an answer marker present in exactly half of questions', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=+correct'], ['=wrong 1'], ['=wrong 2']]),
			...bracketQuestion('Question 2', [['=wrong 1'], ['=+correct'], ['=wrong 2']]),
			...bracketQuestion('Question 3', [['=answer 1'], ['=answer 2'], ['=answer 3']]),
			...bracketQuestion('Question 4', [['=answer 1'], ['=answer 2'], ['=answer 3']])
		]);

		expect(resolveAnswerMarker(questions)).toEqual({ confirmed: false });
	});

	test('prefers a visual marker over consuming a coinciding symbolic answer', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=/', 1], ['= other 1'], ['= other 2']]),
			...bracketQuestion('Question 2', [['= other 1'], ['=/', 1], ['= other 2']])
		]);
		const marker = resolveAnswerMarker(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.symbolPrefix).toBeNull();
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.symbolPrefix
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(
				question => question.options.find(option => option.isCorrect)?.text
			)
		).toEqual(['/', '/']);
	});

	test('does not consume answer symbols beyond the confirmed marker prefix', () => {
		const questions = segment([
			...bracketQuestion('Question 1', [['=<4'], ['~<32'], ['~<15'], ['~<8'], ['~normal']]),
			...bracketQuestion('Question 2', [['~<10'], ['~<9'], ['~<8'], ['=100'], ['~normal']])
		]);
		const marker = resolveAnswerMarker(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.symbolPrefix).toBe('=');
		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.symbolPrefix
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(
			result.document.questions.map(question => question.options.map(option => option.text))
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
		const marker = resolveAnswerMarker(questions);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		const result = assembleTestDocument(
			questions,
			marker.marked,
			new Set(marker.ambiguous),
			marker.symbolPrefix
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions[0].options).toHaveLength(2);
		expect(result.document.questions[0].options[0].text).toBe(
			'диафрагмально-селезеночно-ободочная связка'
		);
	});
});
