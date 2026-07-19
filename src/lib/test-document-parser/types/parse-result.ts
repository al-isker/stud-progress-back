import { TestDocument } from './test-document';

/**
 * Причина, по которой документ признан невалидным. Только для логов и UX,
 * на бинарный статус не влияет. Точный перечень определим после анализа PDF.
 */
export type InvalidReason = string;

/**
 * Итог парсинга — строго бинарный: либо валидный документ целиком, либо
 * невалидный. Промежуточного (частично распарсенного) состояния нет.
 */
export type ParseResult =
	| { status: 'valid'; document: TestDocument }
	| { status: 'invalid'; reason?: InvalidReason };
