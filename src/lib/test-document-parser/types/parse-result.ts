import { TestDocument } from './test-document';

/**
 * Причина, по которой документ признан невалидным. Только для логов и UX,
 * на бинарный статус не влияет.
 */
export type InvalidReason =
	| 'unsupported-format'
	| 'unreadable-document'
	| 'no-questions-found'
	| 'question-without-options'
	| 'no-answer-marker'
	| 'ambiguous-answer-marker'
	| 'empty-question-text'
	| 'empty-option-text';

/** Вопрос, из-за которого документ признан невалидным. Только для логов и UX. */
export interface InvalidQuestion {
	/** Порядковый номер вопроса в порядке следования в документе, начиная с 1. */
	index: number;
	text: string;
}

/**
 * Итог парсинга — строго бинарный: либо валидный документ целиком, либо
 * невалидный. Промежуточного (частично распарсенного) состояния нет.
 *
 * `questions` заполняется для причин, привязанных к конкретным вопросам
 * (нет маркера, маркер неоднозначен, мало вариантов, пустые тексты), и
 * перечисляет вопросы-виновники.
 */
export type ParseResult =
	| { status: 'valid'; document: TestDocument }
	| { status: 'invalid'; reason: InvalidReason; questions?: InvalidQuestion[] };
