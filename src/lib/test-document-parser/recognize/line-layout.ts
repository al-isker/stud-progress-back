import type { DocLine } from '../types/document-model';

/** Начало нового визуального параграфа: первая строка потока или относительный разрыв. */
export function isParagraphStart(line: DocLine): boolean {
	return line.gapBefore === null || line.gapBefore > line.size * 1.6;
}

/** Совместимое оформление текста без привязки к абсолютным координатам страницы. */
export function hasCompatibleTypography(left: DocLine, right: DocLine): boolean {
	return (
		Math.abs(left.size - right.size) <= Math.max(left.size, right.size) * 0.05 &&
		Math.abs(left.boldFrac - right.boldFrac) <= 0.2 &&
		Math.abs(left.italicFrac - right.italicFrac) <= 0.2
	);
}

/** Совместимое оформление и относительное положение строк одного визуального блока. */
export function hasCompatibleLineLayout(left: DocLine, right: DocLine): boolean {
	return (
		hasCompatibleTypography(left, right) &&
		Math.abs(left.x0 - right.x0) <= Math.max(left.size, right.size)
	);
}

/** Переход в следующий последовательный поток чтения: страницу либо колонку. */
export function continuesReadingFlow(previous: DocLine, next: DocLine): boolean {
	return (
		next.page === previous.page + 1 ||
		(next.page === previous.page && next.gapBefore === null && next.y > previous.y)
	);
}
