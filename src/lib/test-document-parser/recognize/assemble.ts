import {
	ParseResult,
	ParseStatus,
	QuestionRejectionReason,
	RejectedQuestion
} from '../types/parse-result';
import { Question } from '../types/test-document';
import { parseMatchingPairs } from './matching';
import {
	containsDuplicateOptions,
	containsDuplicatedTwoPrefixSyntax,
	containsMachineMetadata,
	containsOptionSyntaxInQuestionText,
	materializeQuestionContent
} from './question-content';
import { SegmentedDocument } from './segment';
import { QuestionSyntaxResult } from './syntax-profile';

/**
 * Собирает принятый документ. Matching-вопросы не требуют указателя правильного
 * ответа; остальные вопросы с пустым текстом, малым количеством вариантов,
 * противоречивым или ненайденным указателем уходят в
 * массив `issues.rejectedQuestions` и в `document.questions` НЕ
 * включаются. Мы ничего не «нормализуем» — как извлечено, так и раскладываем.
 * index сохраняет позицию в исходном документе, поэтому в `document.questions`
 * возможны пропуски номеров.
 *
 * Сборка не выводит синтаксис и не исправляет его: она получает результат
 * применения уже зафиксированного профиля и проверяет только общие инварианты
 * итогового контента.
 */
export function assembleTestDocument(
	document: SegmentedDocument,
	syntaxResults: QuestionSyntaxResult[]
): ParseResult {
	const { questions: raw, structure } = document;
	const questions: Question[] = [];
	const rejectedQuestions: RejectedQuestion[] = [];

	for (let qi = 0; qi < raw.length; qi++) {
		const syntax = syntaxResults[qi];
		const consumedTextPrefixes = syntax?.consumedTextPrefixes ?? raw[qi].options.map(() => null);
		const content = materializeQuestionContent(raw[qi], consumedTextPrefixes);
		const { text } = content;
		const options = content.options.map((option, oi) => ({
			...option,
			isCorrect: syntax?.kind === 'choice' ? syntax.marked[oi] : false
		}));

		const rejectQuestion = (reason: QuestionRejectionReason) => {
			rejectedQuestions.push({ index: qi + 1, text, reason });
		};

		if (raw[qi].rejectionReason) {
			rejectQuestion(raw[qi].rejectionReason);
			continue;
		}
		if (
			containsMachineMetadata(raw[qi]) ||
			containsDuplicatedTwoPrefixSyntax(raw[qi], text, consumedTextPrefixes, structure)
		) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		const hasEmptyText = !text || options.some(option => !option.text);
		if (!hasEmptyText && options.length >= 2 && containsDuplicateOptions(options)) {
			rejectQuestion(QuestionRejectionReason.DUPLICATE_OPTIONS);
			continue;
		}
		if (
			syntax?.kind === 'rejected' &&
			syntax.reason === QuestionRejectionReason.MALFORMED_STRUCTURE
		) {
			rejectQuestion(syntax.reason);
			continue;
		}
		if (hasEmptyText) {
			rejectQuestion(QuestionRejectionReason.EMPTY_TEXT);
			continue;
		}
		if (options.length === 1 && !(syntax?.kind === 'choice' && syntax.grammar === 'percentage')) {
			rejectQuestion(QuestionRejectionReason.SINGLE_OPTION);
			continue;
		}
		if (options.length === 0) {
			rejectQuestion(QuestionRejectionReason.NO_OPTIONS);
			continue;
		}
		if (containsOptionSyntaxInQuestionText(raw[qi], structure)) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (syntax?.kind === 'rejected') {
			rejectQuestion(syntax.reason);
			continue;
		}
		if (syntax?.kind === 'matching') {
			const pairs = parseMatchingPairs(options);
			if (pairs) {
				questions.push({ index: qi + 1, text, type: 'matching', pairs });
				continue;
			}
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (!syntax || syntax.kind !== 'choice') {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		const correctCount = options.filter(o => o.isCorrect).length;
		questions.push({
			index: qi + 1,
			text,
			type: correctCount >= 2 ? 'multiple' : 'single',
			options
		});
	}

	return {
		status: ParseStatus.ACCEPTED,
		document: { questions },
		issues: { rejectedQuestions }
	};
}
