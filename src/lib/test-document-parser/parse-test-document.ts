import { ParseResult } from './types/parse-result';

/** Вход парсера: сырые байты документа и необязательные подсказки формата. */
export interface ParseInput {
	data: Buffer;
	/** Имя файла — подсказка для будущего определения формата. */
	filename?: string;
	/** MIME-тип — ещё одна подсказка для определения формата. */
	mime?: string;
}

/**
 * Публичная точка входа модуля.
 *
 * Внутренняя реализация (извлечение содержимого и детекция правильного ответа)
 * появится после анализа реальных PDF — см. отложенные пункты плана.
 */
export async function parseTestDocument(input: ParseInput): Promise<ParseResult> {
	throw new Error(
		`parseTestDocument is not implemented yet (input: ${input.filename ?? 'unnamed'})`
	);
}
