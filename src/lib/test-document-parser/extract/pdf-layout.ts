export interface PositionedPdfItem {
	x: number;
	y: number;
	w: number;
	size: number;
}

/** Группирует видимые текстовые элементы по общей базовой линии. */
export function groupPdfItemsByBaseline<T extends PositionedPdfItem & { str: string }>(
	items: readonly T[]
): T[][] {
	const visible = items.filter(item => item.str.trim() !== '');
	visible.sort((left, right) => right.y - left.y || left.x - right.x);
	const groups: T[][] = [];
	for (const item of visible) {
		const last = groups[groups.length - 1];
		if (last && Math.abs(last[0].y - item.y) <= Math.max(2, item.size * 0.45)) {
			last.push(item);
		} else {
			groups.push([item]);
		}
	}

	return groups;
}

export interface PdfColumnGroup<T extends PositionedPdfItem> {
	column: number;
	items: T[];
}

export interface ArrangedPdfPageGroups<T extends PositionedPdfItem> {
	groups: PdfColumnGroup<T>[];
	columnCenters: number[] | null;
}

interface HorizontalFragment<T extends PositionedPdfItem> {
	groupIndex: number;
	items: T[];
	start: number;
	end: number;
	y: number;
}

/**
 * Делит одну базовую строку на независимые горизонтальные фрагменты.
 * Один и тот же критерий используется и раскладкой колонок, и распознаванием
 * колонтитулов: то, что визуально связано с текстом, нельзя удалять отдельно.
 */
export function splitPdfHorizontalGroup<T extends PositionedPdfItem>(
	group: T[],
	pageWidth: number
): T[][] {
	const sorted = [...group].sort((left, right) => left.x - right.x);
	const fragments: T[][] = [];
	for (const item of sorted) {
		const current = fragments[fragments.length - 1];
		const previous = current?.[current.length - 1];
		const gap = previous ? item.x - (previous.x + previous.w) : 0;
		const splitThreshold = Math.max(
			pageWidth * 0.035,
			Math.max(previous?.size ?? 0, item.size) * 2.3
		);
		if (!current || gap > splitThreshold) fragments.push([item]);
		else current.push(item);
	}

	return fragments;
}

function splitHorizontalFragments<T extends PositionedPdfItem>(
	group: T[],
	groupIndex: number,
	pageWidth: number
): HorizontalFragment<T>[] {
	return splitPdfHorizontalGroup(group, pageWidth).map(items => ({
		groupIndex,
		items,
		start: items[0].x,
		end: Math.max(...items.map(item => item.x + item.w)),
		y: items[0].y
	}));
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function distinctGroupCount<T extends PositionedPdfItem>(
	fragments: HorizontalFragment<T>[]
): number {
	return new Set(fragments.map(fragment => fragment.groupIndex)).size;
}

interface VerticalSpan {
	min: number;
	max: number;
}

function verticalSpan<T extends PositionedPdfItem>(
	fragments: HorizontalFragment<T>[]
): VerticalSpan {
	return {
		min: Math.min(...fragments.map(fragment => fragment.y)),
		max: Math.max(...fragments.map(fragment => fragment.y))
	};
}

function haveOverlappingVerticalSpans(spans: VerticalSpan[]): boolean {
	const base = spans[0];
	for (const span of spans.slice(1)) {
		const overlap = Math.max(0, Math.min(base.max, span.max) - Math.max(base.min, span.min));
		const smallerSpan = Math.min(base.max - base.min, span.max - span.min);
		if (smallerSpan <= 0 || overlap / smallerSpan < 0.4) return false;
	}

	return true;
}

function crossesColumnBoundary<T extends PositionedPdfItem>(
	fragments: HorizontalFragment<T>[],
	centers: number[],
	pageWidth: number,
	spans: VerticalSpan[]
): boolean {
	const overlapMin = Math.max(...spans.map(span => span.min));
	const overlapMax = Math.min(...spans.map(span => span.max));
	const boundaries = centers.slice(1).map(center => center - pageWidth * 0.04);

	return fragments.some(fragment => {
		if (fragment.y < overlapMin || fragment.y > overlapMax) return false;

		return boundaries.some(boundary => fragment.start < boundary && fragment.end > boundary);
	});
}

/**
 * Возвращает начала только независимо подтверждённых колонок. Редкие удалённые
 * фрагменты считаются шумом и не объединяются между собой, чтобы случайные
 * широкие пробелы выровненной строки не могли образовать новую колонку.
 */
function detectColumnCenters<T extends PositionedPdfItem>(
	fragments: HorizontalFragment<T>[],
	pageLeft: number,
	pageWidth: number
): number[] | null {
	if (fragments.length < 12) return null;
	const sorted = [...fragments].sort((left, right) => left.start - right.start);
	const clusters: HorizontalFragment<T>[][] = [[]];
	for (const fragment of sorted) {
		const current = clusters[clusters.length - 1];
		const previous = current[current.length - 1];
		if (previous && fragment.start - previous.start > pageWidth * 0.14) clusters.push([]);
		clusters[clusters.length - 1].push(fragment);
	}

	const minimumClusterSize = Math.max(4, Math.floor(fragments.length * 0.08));
	const confirmed = clusters.filter(cluster => distinctGroupCount(cluster) >= minimumClusterSize);
	if (confirmed.length < 2 || confirmed.length > 4) return null;

	const centers = confirmed
		.map(cluster => median(cluster.map(fragment => fragment.start)))
		.sort((left, right) => left - right);
	if (centers[0] > pageLeft + pageWidth * 0.25) return null;
	// Некоторые страницы продолжают двухколоночный набор лишь на левых двух
	// третях листа, оставляя правую треть пустой.
	if (centers[centers.length - 1] < pageLeft + pageWidth * 0.35) return null;
	if (centers.some((center, index) => index > 0 && center - centers[index - 1] < pageWidth * 0.2)) {
		return null;
	}

	const spans = confirmed.map(verticalSpan);
	if (!haveOverlappingVerticalSpans(spans)) return null;
	// Если предполагаемая граница режет уже подтверждённый непрерывный
	// фрагмент, геометрия противоречива и раскладывать страницу по колонкам нельзя.
	if (crossesColumnBoundary(fragments, centers, pageWidth, spans)) return null;

	return centers;
}

function supportsColumnHint<T extends PositionedPdfItem>(
	fragments: HorizontalFragment<T>[],
	centers: number[],
	pageWidth: number
): boolean {
	const supportingFragments = centers.map(center =>
		fragments.filter(fragment => Math.abs(fragment.start - center) <= pageWidth * 0.06)
	);
	if (supportingFragments.some(current => distinctGroupCount(current) < 2)) return false;
	const spans = supportingFragments.map(verticalSpan);
	if (!haveOverlappingVerticalSpans(spans)) return false;

	return !crossesColumnBoundary(fragments, centers, pageWidth, spans);
}

/**
 * Раскладывает базовые строки страницы по колонкам. Непрерывный горизонтальный
 * фрагмент неделим: колонку получает весь фрагмент, а не отдельные слова внутри.
 */
export function arrangePdfPageGroups<T extends PositionedPdfItem>(
	groups: T[][],
	pageLeft: number,
	pageWidth: number,
	columnCentersHint: number[] | null
): ArrangedPdfPageGroups<T> {
	const fragmentsByGroup = groups.map((group, index) =>
		splitHorizontalFragments(group, index, pageWidth)
	);
	const fragments = fragmentsByGroup.flat();
	const detectedCenters = detectColumnCenters(fragments, pageLeft, pageWidth);
	const centers =
		detectedCenters ??
		(columnCentersHint && supportsColumnHint(fragments, columnCentersHint, pageWidth)
			? columnCentersHint
			: null);
	if (!centers) {
		return {
			groups: groups.map(items => ({ column: 0, items })),
			columnCenters: null
		};
	}

	const arranged: PdfColumnGroup<T>[] = [];
	for (const groupFragments of fragmentsByGroup) {
		const byColumn = new Map<number, T[]>();
		for (const fragment of groupFragments) {
			let column = 0;
			for (let index = 1; index < centers.length; index++) {
				if (fragment.start >= centers[index] - pageWidth * 0.04) column = index;
			}
			byColumn.set(column, [...(byColumn.get(column) ?? []), ...fragment.items]);
		}
		for (const [column, items] of byColumn) arranged.push({ column, items });
	}

	return {
		groups: arranged.sort(
			(left, right) => left.column - right.column || right.items[0].y - left.items[0].y
		),
		columnCenters: centers
	};
}
