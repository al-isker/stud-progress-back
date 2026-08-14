import { extractPdfLines } from './extract/extract-pdf';
import { assembleTestDocument } from './recognize/assemble';
import { resolveAnswerMarker } from './recognize/detect-marker';
import { segmentQuestions } from './recognize/segment';
import { DocLine } from './types/document-model';
import { ParseRejectionReason, ParseResult, ParseStatus } from './types/parse-result';

/** Вход парсера: сырые байты документа и необязательные подсказки формата. */
export interface ParseInput {
	data: Buffer;
	/** Имя файла — подсказка для определения формата. */
	filename?: string;
	/** MIME-тип — ещё одна подсказка для определения формата. */
	mime?: string;
}

const reject = (reason: ParseRejectionReason): ParseResult => ({
	status: ParseStatus.REJECTED,
	reason
});

const MAX_QUESTION_COUNT = 2000;

/**
 * Публичная точка входа модуля.
 *
 * Конвейер: извлечение строк с визуальными атрибутами → сегментация на вопросы
 * и варианты → поиск признака, выделяющего правильные ответы, → сборка.
 * Документ принимается, даже если у части вопросов мало вариантов, указатель
 * ответа не найден или противоречив (такие вопросы попадают в
 * `issues.rejectedQuestions`). Документ отклоняется только при проблемах уровня
 * документа.
 */
export async function parseTestDocument(input: ParseInput): Promise<ParseResult> {
	const claimsPdf = /\.pdf$/i.test(input.filename ?? '') || /pdf/i.test(input.mime ?? '');
	const hasPdfMagic = input.data.subarray(0, 1024).includes('%PDF-');
	if (!hasPdfMagic) {
		return reject(
			claimsPdf ? ParseRejectionReason.UNREADABLE_DOCUMENT : ParseRejectionReason.UNSUPPORTED_FORMAT
		);
	}

	let lines: DocLine[];
	try {
		lines = await extractPdfLines(input.data);
	} catch {
		return reject(ParseRejectionReason.UNREADABLE_DOCUMENT);
	}

	const raw = segmentQuestions(lines);
	if (!raw) return reject(ParseRejectionReason.QUESTION_STRUCTURE_NOT_RECOGNIZED);
	if (raw.length > MAX_QUESTION_COUNT) {
		return reject(ParseRejectionReason.QUESTION_LIMIT_EXCEEDED);
	}

	// Указатель ответа ищем только среди вопросов с двумя и более вариантами.
	const answerableIndices: number[] = [];
	raw.forEach((q, i) => {
		if (!q.rejectionReason && q.options.length >= 2) answerableIndices.push(i);
	});

	const marker = resolveAnswerMarker(answerableIndices.map(i => raw[i]));
	if (!marker.confirmed) {
		return reject(ParseRejectionReason.ANSWER_MARKER_NOT_RECOGNIZED);
	}

	const marks: (boolean[] | undefined)[] = raw.map(() => undefined);
	const consumedTextPrefixes: ((string | null)[] | undefined)[] = raw.map(() => undefined);
	const matchingGlobal = new Set<number>();
	answerableIndices.forEach((globalIndex, localIndex) => {
		marks[globalIndex] = marker.marked[localIndex];
		consumedTextPrefixes[globalIndex] = marker.consumedTextPrefixes[localIndex];
		if (marker.matching[localIndex]) matchingGlobal.add(globalIndex);
	});
	const ambiguousGlobal = new Set(
		marker.ambiguous.map(localIndex => answerableIndices[localIndex])
	);

	return assembleTestDocument(raw, marks, ambiguousGlobal, consumedTextPrefixes, matchingGlobal);
}
