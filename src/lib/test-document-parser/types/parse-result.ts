import { TestDocument } from './test-document';

/** Статус разбора документа. */
export enum ParseStatus {
	VALID = 'VALID',
	INVALID = 'INVALID'
}

/** Причина, по которой документ признан невалидным. Только для логов и UX. */
export enum InvalidReason {
	UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
	UNREADABLE_DOCUMENT = 'UNREADABLE_DOCUMENT',
	NO_QUESTIONS_FOUND = 'NO_QUESTIONS_FOUND',
	QUESTION_WITHOUT_OPTIONS = 'QUESTION_WITHOUT_OPTIONS',
	NO_ANSWER_MARKER = 'NO_ANSWER_MARKER',
	AMBIGUOUS_ANSWER_MARKER = 'AMBIGUOUS_ANSWER_MARKER',
	EMPTY_QUESTION_TEXT = 'EMPTY_QUESTION_TEXT',
	EMPTY_OPTION_TEXT = 'EMPTY_OPTION_TEXT'
}

/** Ссылка на вопрос — для перечней невалидных вопросов и вопросов без ответа. */
export interface QuestionRef {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
}

/**
 * Итог парсинга — по-прежнему два статуса.
 *
 * `valid` содержит документ и `unansweredQuestions` — вопросы, для которых не
 * удалось определить правильный ответ (сам вопрос и варианты распознаны, но
 * указателя ответа нет). Их наличие не делает документ невалидным.
 *
 * `invalid` возвращается только при проблемах уровня документа или структуры
 * (не PDF, не читается, нет вопросов, вопрос без вариантов, пустые тексты, ни
 * одного размеченного ответа во всём документе). `invalidQuestions` перечисляет
 * вопросы-виновники, если причина к ним привязана.
 */
export type ParseResult =
	| { status: ParseStatus.VALID; document: TestDocument; unansweredQuestions: QuestionRef[] }
	| { status: ParseStatus.INVALID; reason: InvalidReason; invalidQuestions?: QuestionRef[] };
