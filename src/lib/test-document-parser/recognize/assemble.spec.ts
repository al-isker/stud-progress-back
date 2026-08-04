import { ParseStatus, QuestionRejectionReason } from '../types/parse-result';
import { assembleTestDocument } from './assemble';
import { RawQuestion } from './segment';

const option = (text: string) => ({
	sourcePrefix: null,
	structuralPrefix: null,
	hasTextAfterSourcePrefix: false,
	texts: [text],
	lines: []
});

describe('assembleTestDocument', () => {
	test('возвращает единый массив отклонённых вопросов с причинами', () => {
		const raw: RawQuestion[] = [
			{ texts: [''], options: [option('Первый'), option('Второй')] },
			{ texts: ['Мало вариантов'], options: [option('Единственный')] },
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
			[[true, false], undefined, [true, false], [false, false], undefined],
			new Set([2])
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
						reason: QuestionRejectionReason.INSUFFICIENT_OPTIONS
					},
					{
						index: 3,
						text: 'Неоднозначный маркер',
						reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER
					},
					{
						index: 4,
						text: 'Маркер не найден',
						reason: QuestionRejectionReason.NO_ANSWER_MARKER
					},
					{
						index: 5,
						text: 'Повреждённая структура',
						reason: QuestionRejectionReason.MALFORMED_STRUCTURE
					}
				]
			}
		});
	});
});
