import { extractPdfLines } from './extract/extract-pdf';
import { assembleTestDocument, normalizeText } from './recognize/assemble';
import { resolveAnswerMarker } from './recognize/detect-marker';
import { RawQuestion, segmentQuestions } from './recognize/segment';
import { DocLine } from './types/document-model';
import { InvalidReason, ParseResult, ParseStatus, QuestionRef } from './types/parse-result';

/** Вход парсера: сырые байты документа и необязательные подсказки формата. */
export interface ParseInput {
	data: Buffer;
	/** Имя файла — подсказка для определения формата. */
	filename?: string;
	/** MIME-тип — ещё одна подсказка для определения формата. */
	mime?: string;
}

const invalid = (reason: InvalidReason): ParseResult => ({ status: ParseStatus.INVALID, reason });

/** Собирает ссылки на вопросы по их индексам в разобранном документе. */
function refs(raw: RawQuestion[], indices: number[]): QuestionRef[] {
	return indices.map(i => ({ index: i + 1, text: normalizeText(raw[i].texts) }));
}

/**
 * Публичная точка входа модуля.
 *
 * Конвейер: извлечение строк с визуальными атрибутами → сегментация на вопросы
 * и варианты → поиск признака, выделяющего правильные ответы, → строгая сборка.
 * Документ валиден, даже если у части вопросов ответ не размечен (они попадают
 * в `unansweredQuestions`); невалиден — при проблемах уровня документа.
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

	const withoutOptions = raw.map((q, i) => (q.options.length < 2 ? i : -1)).filter(i => i >= 0);
	if (withoutOptions.length > 0) {
		return {
			status: ParseStatus.INVALID,
			reason: InvalidReason.QUESTION_WITHOUT_OPTIONS,
			invalidQuestions: refs(raw, withoutOptions)
		};
	}

	const marker = resolveAnswerMarker(raw);
	if ('reason' in marker) {
		return marker.questions.length > 0
			? {
					status: ParseStatus.INVALID,
					reason: marker.reason,
					invalidQuestions: refs(raw, marker.questions)
				}
			: invalid(marker.reason);
	}

	return assembleTestDocument(raw, marker.marked);
}
