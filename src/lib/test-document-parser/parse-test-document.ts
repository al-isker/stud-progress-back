import { extractPdfLines } from './extract/extract-pdf';
import { assembleTestDocument, normalizeText } from './recognize/assemble';
import { resolveAnswerMarker } from './recognize/detect-marker';
import { RawQuestion, segmentQuestions } from './recognize/segment';
import { DocLine } from './types/document-model';
import { InvalidQuestion, InvalidReason, ParseResult } from './types/parse-result';

/** Вход парсера: сырые байты документа и необязательные подсказки формата. */
export interface ParseInput {
	data: Buffer;
	/** Имя файла — подсказка для определения формата. */
	filename?: string;
	/** MIME-тип — ещё одна подсказка для определения формата. */
	mime?: string;
}

const invalid = (reason: InvalidReason): ParseResult => ({ status: 'invalid', reason });

/** Собирает список вопросов-виновников по их индексам в разобранном документе. */
function culprits(raw: RawQuestion[], indices: number[]): InvalidQuestion[] {
	return indices.map(i => ({ index: i + 1, text: normalizeText(raw[i].texts) }));
}

/**
 * Публичная точка входа модуля.
 *
 * Конвейер: извлечение строк с визуальными атрибутами → сегментация на вопросы
 * и варианты → поиск признака, выделяющего правильные ответы, → строгая сборка.
 * Результат бинарный: документ либо распознан целиком, либо невалиден.
 */
export async function parseTestDocument(input: ParseInput): Promise<ParseResult> {
	const claimsPdf = /\.pdf$/i.test(input.filename ?? '') || /pdf/i.test(input.mime ?? '');
	const hasPdfMagic = input.data.subarray(0, 1024).includes('%PDF-');
	if (!hasPdfMagic) return invalid(claimsPdf ? 'unreadable-document' : 'unsupported-format');

	let lines: DocLine[];
	try {
		lines = await extractPdfLines(input.data);
	} catch {
		return invalid('unreadable-document');
	}

	const raw = segmentQuestions(lines);
	if (!raw) return invalid('no-questions-found');

	const withoutOptions = raw.map((q, i) => (q.options.length < 2 ? i : -1)).filter(i => i >= 0);
	if (withoutOptions.length > 0) {
		return {
			status: 'invalid',
			reason: 'question-without-options',
			questions: culprits(raw, withoutOptions)
		};
	}

	const marker = resolveAnswerMarker(raw);
	if ('reason' in marker) {
		return { status: 'invalid', reason: marker.reason, questions: culprits(raw, marker.questions) };
	}

	return assembleTestDocument(raw, marker.marked);
}
