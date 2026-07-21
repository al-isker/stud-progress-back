import { TestDocument } from './test-document';

/** Статус разбора документа. */
export enum ParseStatus {
	VALID = 'VALID',
	INVALID = 'INVALID'
}

/**
 * Причина, по которой документ признан невалидным. Только проблемы уровня
 * документа: его нельзя прочитать или разобрать как набор вопросов. Проблемы
 * отдельных вопросов документ невалидным не делают — см. {@link InvalidQuestions}.
 */
export enum InvalidReason {
	UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
	UNREADABLE_DOCUMENT = 'UNREADABLE_DOCUMENT',
	NO_QUESTIONS_FOUND = 'NO_QUESTIONS_FOUND'
}

/** Ссылка на вопрос — для перечней проблемных вопросов. */
export interface QuestionRef {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
}

/**
 * Вопросы с проблемами, которые НЕ делают документ невалидным. В основной массив
 * `document.questions` они не входят — только в эти перечни (для логов и UX).
 */
export interface InvalidQuestions {
	/** Вопросы с пустым текстом вопроса или пустым текстом варианта. */
	emptyText: QuestionRef[];
	/** Вопросы, у которых меньше двух вариантов ответа. */
	withoutOptions: QuestionRef[];
	/** Вопросы, где признак-указатель ответа противоречив. */
	ambiguousAnswerMarker: QuestionRef[];
	/** Вопросы, где указатель правильного ответа не найден. */
	noAnswerMarker: QuestionRef[];
}

/**
 * Итог парсинга — два статуса.
 *
 * `VALID` содержит разобранный документ и `invalidQuestions` — вопросы с
 * частными проблемами (мало вариантов, противоречивый или ненайденный указатель
 * ответа). Их наличие документ невалидным не делает.
 *
 * `INVALID` возвращается только при проблемах уровня документа (не PDF, не
 * читается, нет вопросов).
 */
export type ParseResult =
	| { status: ParseStatus.VALID; document: TestDocument; invalidQuestions: InvalidQuestions }
	| { status: ParseStatus.INVALID; reason: InvalidReason };
