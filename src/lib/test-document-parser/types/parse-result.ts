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

/**
 * Итог парсинга — строго бинарный: либо валидный документ целиком, либо
 * невалидный. Промежуточного (частично распарсенного) состояния нет.
 */
export type ParseResult =
	| { status: 'valid'; document: TestDocument }
	| { status: 'invalid'; reason: InvalidReason };
