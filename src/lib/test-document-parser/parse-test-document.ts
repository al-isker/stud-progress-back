import { extractPdfLines } from './extract/extract-pdf';
import { assembleTestDocument } from './recognize/assemble';
import { resolveAnswerMarker } from './recognize/detect-marker';
import { segmentQuestions } from './recognize/segment';
import { DocLine } from './types/document-model';
import { InvalidReason, ParseResult, ParseStatus } from './types/parse-result';

/** Вход парсера: сырые байты документа и необязательные подсказки формата. */
export interface ParseInput {
	data: Buffer;
	/** Имя файла — подсказка для определения формата. */
	filename?: string;
	/** MIME-тип — ещё одна подсказка для определения формата. */
	mime?: string;
}

const invalid = (reason: InvalidReason): ParseResult => ({ status: ParseStatus.INVALID, reason });

/**
 * Публичная точка входа модуля.
 *
 * Конвейер: извлечение строк с визуальными атрибутами → сегментация на вопросы
 * и варианты → поиск признака, выделяющего правильные ответы, → сборка.
 * Документ валиден, даже если у части вопросов мало вариантов, указатель ответа
 * не найден или противоречив (такие вопросы попадают в `invalidQuestions`).
 * Невалиден — только при проблемах уровня документа.
 */
export async function parseTestDocument(input: ParseInput): Promise<ParseResult> {
	const claimsPdf = /\.pdf$/i.test(input.filename ?? '') || /pdf/i.test(input.mime ?? '');
	const hasPdfMagic = input.data.subarray(0, 1024).includes('%PDF-');
	if (!hasPdfMagic) {
		return invalid(
			claimsPdf ? InvalidReason.UNREADABLE_DOCUMENT : InvalidReason.UNSUPPORTED_FORMAT
		);
	}

	let lines: DocLine[];
	try {
		lines = await extractPdfLines(input.data);
	} catch {
		return invalid(InvalidReason.UNREADABLE_DOCUMENT);
	}

	const raw = segmentQuestions(lines);
	if (!raw) return invalid(InvalidReason.NO_QUESTIONS_FOUND);

	// Указатель ответа ищем только среди вопросов с двумя и более вариантами.
	const answerableIndices: number[] = [];
	raw.forEach((q, i) => {
		if (q.options.length >= 2) answerableIndices.push(i);
	});

	const marker = resolveAnswerMarker(answerableIndices.map(i => raw[i]));
	if (!marker.confirmed) return invalid(InvalidReason.ANSWER_MARKER_NOT_CONFIRMED);

	const marks: (boolean[] | undefined)[] = raw.map(() => undefined);
	answerableIndices.forEach((globalIndex, localIndex) => {
		marks[globalIndex] = marker.marked[localIndex];
	});
	const ambiguousGlobal = new Set(
		marker.ambiguous.map(localIndex => answerableIndices[localIndex])
	);

	return assembleTestDocument(raw, marks, ambiguousGlobal);
}
