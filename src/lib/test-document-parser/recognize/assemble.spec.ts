import { ParseStatus, QuestionRejectionReason } from '../types/parse-result';
import { assembleTestDocument as assembleRecognizedDocument } from './assemble';
import { OptionSyntaxProfile, RawQuestion, SegmentedDocument } from './segment';
import { QuestionSyntaxResult } from './syntax-profile';

const option = (...texts: string[]) => ({
	sourcePrefix: null,
	structuralPrefix: null,
	hasTextAfterSourcePrefix: false,
	texts,
	lines: []
});

function optionSyntax(raw: RawQuestion[]): OptionSyntaxProfile | null {
	const prefixes = new Map<string, string>();
	for (const prefix of raw.flatMap(question =>
		question.options.flatMap(item => item.structuralPrefix ?? [])
	)) {
		prefixes.set(prefix[0], prefix);
	}

	return prefixes.size > 0 ? { prefixByFamily: prefixes } : null;
}

function assembleTestDocument(
	raw: RawQuestion[],
	marks: (boolean[] | undefined)[],
	ambiguous: Set<number>,
	consumedTextPrefixes: ((string | null)[] | undefined)[] = [],
	matching: Set<number> = new Set()
) {
	const options = optionSyntax(raw);
	const document: SegmentedDocument = {
		questions: raw,
		structure: raw.some(question => question.texts.join(' ').startsWith('?'))
			? {
					kind: 'two-prefix',
					questionPrefix: '?',
					options: options ?? { prefixByFamily: new Map() }
				}
			: { kind: 'numbered', options }
	};
	const syntax: QuestionSyntaxResult[] = raw.map((question, index) => {
		const prefixes = consumedTextPrefixes[index] ?? question.options.map(() => null);
		if (matching.has(index)) return { kind: 'matching', consumedTextPrefixes: prefixes };
		if (ambiguous.has(index)) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER,
				consumedTextPrefixes: prefixes
			};
		}
		const marked = marks[index] ?? question.options.map(() => false);

		return marked.some(Boolean)
			? { kind: 'choice', grammar: 'document', marked, consumedTextPrefixes: prefixes }
			: {
					kind: 'rejected',
					reason: QuestionRejectionReason.NO_ANSWER_MARKER,
					consumedTextPrefixes: prefixes
				};
	});

	return assembleRecognizedDocument(document, syntax);
}

describe('assembleTestDocument', () => {
	test('removes only a soft hyphen and preserves visible hyphens between lines', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Вопрос'],
				options: [
					option('паци\u00ad', 'ент'),
					option('онлайн-', 'курс'),
					option('что‐', 'либо'),
					option('позиция –', 'этой'),
					option('матки -', 'это'),
					option('стеклами -', '2.0')
				]
			}
		];

		const result = assembleTestDocument(
			raw,
			[[true, false, false, false, false, false]],
			new Set()
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');
		const question = result.document.questions[0];
		if (question.type === 'matching') throw new Error('Question was recognized as matching');

		expect(question.options.map(item => item.text)).toEqual([
			'пациент',
			'онлайн-курс',
			'что‐либо',
			'позиция – этой',
			'матки - это',
			'стеклами -2.0'
		]);
	});

	test('собирает matching-вопрос без маркеров правильного ответа', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Соотнесите страну и столицу'],
				options: [option('Канада=Оттава'), option('Италия=Рим'), option('Япония=Токио')]
			}
		];

		const result = assembleTestDocument(raw, [[false, false, false]], new Set(), [], new Set([0]));

		expect(result).toEqual({
			status: ParseStatus.ACCEPTED,
			document: {
				questions: [
					{
						index: 1,
						text: 'Соотнесите страну и столицу',
						type: 'matching',
						pairs: [
							{ left: 'Канада', right: 'Оттава' },
							{ left: 'Италия', right: 'Рим' },
							{ left: 'Япония', right: 'Токио' }
						]
					}
				]
			},
			issues: { rejectedQuestions: [] }
		});
	});

	test('отклоняет обычный вопрос с одним вариантом независимо от маркера', () => {
		const raw: RawQuestion[] = [
			{ texts: ['С маркером'], options: [option('Единственный')] },
			{ texts: ['Без маркера'], options: [option('Единственный')] }
		];

		const result = assembleTestDocument(raw, [[true], [false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.issues.rejectedQuestions).toEqual([
			{ index: 1, text: 'С маркером', reason: QuestionRejectionReason.SINGLE_OPTION },
			{ index: 2, text: 'Без маркера', reason: QuestionRejectionReason.SINGLE_OPTION }
		]);
	});

	test('принимает один вариант только для подтверждённой процентной грамматики', () => {
		const raw: RawQuestion[] = [{ texts: ['Процентный вопрос'], options: [option('Ответ')] }];
		const result = assembleRecognizedDocument(
			{ questions: raw, structure: { kind: 'numbered', options: null } },
			[
				{
					kind: 'choice',
					grammar: 'percentage',
					marked: [true],
					consumedTextPrefixes: [null]
				}
			]
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toEqual([
			{
				index: 1,
				text: 'Процентный вопрос',
				type: 'single',
				options: [{ index: 1, text: 'Ответ', isCorrect: true }]
			}
		]);
	});

	test('отклоняет вопрос с дублирующимися вариантами независимо от правильности', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Вопрос'],
				options: [option('Повтор'), option('другой вариант'), option('повтор')]
			}
		];

		const result = assembleTestDocument(raw, [[true, false, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toEqual([]);
		expect(result.issues.rejectedQuestions).toEqual([
			{ index: 1, text: 'Вопрос', reason: QuestionRejectionReason.DUPLICATE_OPTIONS }
		]);
	});

	test('preserves an unconsumed plus as answer content', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Question'],
				options: [
					{ ...option('+wrong'), sourcePrefix: '~+', structuralPrefix: '~' },
					{ ...option('correct'), sourcePrefix: '=', structuralPrefix: '=' }
				]
			},
			{
				texts: ['Percentage question'],
				options: [
					{ ...option('%50%+ answer'), sourcePrefix: '~%', structuralPrefix: '~' },
					{ ...option('%-50%wrong'), sourcePrefix: '~%-', structuralPrefix: '~' }
				]
			}
		];

		const result = assembleTestDocument(
			raw,
			[
				[false, true],
				[true, false]
			],
			new Set(),
			[
				[null, null],
				['%50%', '%-50%']
			]
		);
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.issues.rejectedQuestions).toEqual([]);
		expect(
			result.document.questions.map(question => {
				if (question.type === 'matching') throw new Error('Unexpected matching question');

				return question.options.map(item => item.text);
			})
		).toEqual([
			['+wrong', 'correct'],
			['+ answer', 'wrong']
		]);
	});

	test('preserves leading numeric signs and sign sequences in answer text', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Question'],
				options: [option('+2'), option('+4…+10'), option('+ + -')]
			}
		];

		const result = assembleTestDocument(raw, [[true, false, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		const question = result.document.questions[0];
		if (question.type === 'matching') throw new Error('Question was recognized as matching');
		expect(question.options.map(item => item.text)).toEqual(['+2', '+4…+10', '+ + -']);
	});

	test('rejects a question containing machine metadata', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Question'],
				options: [option('Correct'), option('Wrong', '@MDID{C8824D48-FD8E-11E6-BA26-50E549E7BDDC}')]
			}
		];

		const result = assembleTestDocument(raw, [[true, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toEqual([]);
		expect(result.issues.rejectedQuestions).toEqual([
			{ index: 1, text: 'Question', reason: QuestionRejectionReason.MALFORMED_STRUCTURE }
		]);
	});

	test('rejects duplicated two-prefix syntax left inside content', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['?Question'],
				options: [
					{ ...option('!correct'), sourcePrefix: '!+', structuralPrefix: '!' },
					{ ...option('!wrong'), sourcePrefix: '!', structuralPrefix: '!' }
				]
			}
		];

		const result = assembleTestDocument(raw, [[true, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toEqual([]);
		expect(result.issues.rejectedQuestions).toEqual([
			{ index: 1, text: '?Question', reason: QuestionRejectionReason.MALFORMED_STRUCTURE }
		]);
	});

	test('rejects option syntax leaked into the question text', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['=orphaned option', 'Question'],
				options: [
					{ ...option('correct'), sourcePrefix: '=', structuralPrefix: '=' },
					{ ...option('wrong'), sourcePrefix: '~', structuralPrefix: '~' }
				]
			}
		];

		const result = assembleTestDocument(raw, [[true, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toEqual([]);
		expect(result.issues.rejectedQuestions).toEqual([
			{
				index: 1,
				text: '=orphaned option Question',
				reason: QuestionRejectionReason.MALFORMED_STRUCTURE
			}
		]);
	});

	test('keeps marker-like text inside a correctly segmented option', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Question'],
				options: [
					{ ...option('correct'), sourcePrefix: '=', structuralPrefix: '=' },
					{ ...option('!literal@example.com'), sourcePrefix: '~!', structuralPrefix: '~' }
				]
			}
		];

		const result = assembleTestDocument(raw, [[true, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toHaveLength(1);
	});

	test('keeps a single formula continuation that starts with an option prefix', () => {
		const raw: RawQuestion[] = [
			{
				texts: ['Calculate A + B', '= C + D'],
				options: [
					{ ...option('correct'), sourcePrefix: '=', structuralPrefix: '=' },
					{ ...option('wrong'), sourcePrefix: '~', structuralPrefix: '~' }
				]
			}
		];

		const result = assembleTestDocument(raw, [[true, false]], new Set());
		if (result.status !== ParseStatus.ACCEPTED) throw new Error('Document was rejected');

		expect(result.document.questions).toHaveLength(1);
	});

	test('возвращает единый массив отклонённых вопросов с причинами', () => {
		const raw: RawQuestion[] = [
			{ texts: [''], options: [option('Первый'), option('Второй')] },
			{ texts: ['Мало вариантов'], options: [option('Единственный')] },
			{ texts: ['Нет вариантов'], options: [] },
			{ texts: ['Неоднозначный маркер'], options: [option('Первый'), option('Второй')] },
			{ texts: ['Маркер не найден'], options: [option('Первый'), option('Второй')] },
			{
				texts: ['Повреждённая структура'],
				options: [option('Первый'), option('Второй')],
				rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
			}
		];

		const result = assembleTestDocument(
			raw,
			[[true, false], [true], undefined, [true, false], [false, false], undefined],
			new Set([3])
		);

		expect(result).toEqual({
			status: ParseStatus.ACCEPTED,
			document: { questions: [] },
			issues: {
				rejectedQuestions: [
					{ index: 1, text: '', reason: QuestionRejectionReason.EMPTY_TEXT },
					{
						index: 2,
						text: 'Мало вариантов',
						reason: QuestionRejectionReason.SINGLE_OPTION
					},
					{
						index: 3,
						text: 'Нет вариантов',
						reason: QuestionRejectionReason.NO_OPTIONS
					},
					{
						index: 4,
						text: 'Неоднозначный маркер',
						reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER
					},
					{
						index: 5,
						text: 'Маркер не найден',
						reason: QuestionRejectionReason.NO_ANSWER_MARKER
					},
					{
						index: 6,
						text: 'Повреждённая структура',
						reason: QuestionRejectionReason.MALFORMED_STRUCTURE
					}
				]
			}
		});
	});
});
