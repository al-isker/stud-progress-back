import { ParseStatus, QuestionRejectionReason } from '../types/parse-result';
import { assembleTestDocument } from './assemble';
import { RawQuestion } from './segment';

const option = (...texts: string[]) => ({
	sourcePrefix: null,
	structuralPrefix: null,
	hasTextAfterSourcePrefix: false,
	texts,
	lines: []
});

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

	test('отклоняет вопрос с одним вариантом независимо от маркера', () => {
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
