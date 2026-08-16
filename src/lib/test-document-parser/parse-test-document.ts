import { extractPdfLines } from './extract/extract-pdf';
import { assembleTestDocument } from './recognize/assemble';
import { segmentQuestions } from './recognize/segment';
import { recognizeDocumentSyntax } from './recognize/syntax-profile';
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
 * Конвейер: извлечение строк с визуальными атрибутами → вывод структурного
 * профиля и сегментация → вывод полного синтаксического профиля документа →
 * применение профиля к каждому вопросу → сборка результата.
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

	const segmented = segmentQuestions(lines);
	if (!segmented) return reject(ParseRejectionReason.QUESTION_STRUCTURE_NOT_RECOGNIZED);
	if (segmented.questions.length > MAX_QUESTION_COUNT) {
		return reject(ParseRejectionReason.QUESTION_LIMIT_EXCEEDED);
	}

	const syntax = recognizeDocumentSyntax(segmented);
	if (!syntax) {
		return reject(ParseRejectionReason.ANSWER_MARKER_NOT_RECOGNIZED);
	}

	return assembleTestDocument(segmented, syntax.questions);
}
