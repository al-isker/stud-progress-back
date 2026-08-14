import { TestDocument } from './test-document';

/** Статус разбора документа. */
export enum ParseStatus {
	ACCEPTED = 'ACCEPTED',
	REJECTED = 'REJECTED'
}

/**
 * Причина, по которой парсер отклонил документ. Только проблемы уровня
 * документа: его нельзя прочитать или разобрать как набор вопросов. Отклонение
 * отдельных вопросов не приводит к отклонению документа — см. {@link RejectedQuestion}.
 */
export enum ParseRejectionReason {
	UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
	UNREADABLE_DOCUMENT = 'UNREADABLE_DOCUMENT',
	QUESTION_STRUCTURE_NOT_RECOGNIZED = 'QUESTION_STRUCTURE_NOT_RECOGNIZED',
	QUESTION_LIMIT_EXCEEDED = 'QUESTION_LIMIT_EXCEEDED',
	/**
	 * Формат указателя правильного ответа не подтверждён: поддерживаемые локальные
	 * и глобальные стратегии совместно не покрывают строгое большинство вопросов.
	 */
	ANSWER_MARKER_NOT_RECOGNIZED = 'ANSWER_MARKER_NOT_RECOGNIZED'
}

/** Причина, по которой вопрос не включён в разобранный документ. */
export enum QuestionRejectionReason {
	EMPTY_TEXT = 'EMPTY_TEXT',
	SINGLE_OPTION = 'SINGLE_OPTION',
	NO_OPTIONS = 'NO_OPTIONS',
	MALFORMED_STRUCTURE = 'MALFORMED_STRUCTURE',
	AMBIGUOUS_ANSWER_MARKER = 'AMBIGUOUS_ANSWER_MARKER',
	NO_ANSWER_MARKER = 'NO_ANSWER_MARKER'
}

/**
 * Вопрос, который парсер не включил в основной массив `document.questions`.
 * Исходный вопрос не обязательно некорректен: причиной может быть ограничение
 * или ошибка распознавания.
 */
export interface RejectedQuestion {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
	reason: QuestionRejectionReason;
}

/** Некритичные проблемы принятого документа. */
export interface ParseIssues {
	rejectedQuestions: RejectedQuestion[];
}

/**
 * Итог парсинга — документ либо принят, либо отклонён.
 *
 * `ACCEPTED` содержит разобранный документ и `issues.rejectedQuestions` — вопросы,
 * которые парсер не смог надёжно включить в документ. Их наличие не приводит к
 * отклонению документа целиком.
 *
 * `REJECTED` возвращается только при проблемах уровня документа: формат не
 * поддерживается, документ не читается, вопросы не найдены или формат указателя
 * ответа не подтверждён.
 */
export type ParseResult =
	| { status: ParseStatus.ACCEPTED; document: TestDocument; issues: ParseIssues }
	| { status: ParseStatus.REJECTED; reason: ParseRejectionReason };
