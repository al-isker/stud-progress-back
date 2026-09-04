import { DocLine } from '../types/document-model';
import { PdfImageObject, PdfJsModule, PdfPage, loadPdfJs } from './pdfjs';

/** Прямоугольник в координатах страницы (ось Y вверх). */
interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Цветная заливка из контент-стрима. */
interface FillRect extends Box {
	color: string;
}

/** Картинка с загрублённой маской «цветных» пикселей. */
interface ImageRegion extends Box {
	gw: number;
	gh: number;
	grid: Uint8Array;
}

interface ImagePaint {
	id: string;
	box: Box;
	annotationId: string | null;
}

/** Текстовый прогон из контент-стрима: символы + цвет заливки на момент отрисовки. */
interface TextRun {
	chars: string;
	color: string | null;
}

/** Текстовый элемент страницы с уже вычисленным цветом. */
interface StyledItem {
	str: string;
	x: number;
	y: number;
	w: number;
	size: number;
	fontName: string;
	color: string | null;
}

interface ColumnGroup {
	column: number;
	items: StyledItem[];
}

interface ArrangedPageGroups {
	groups: ColumnGroup[];
	columnCenters: number[] | null;
}

interface PageNumberCandidate {
	index: number;
	page: number;
	edge: 'top' | 'bottom';
	value: number;
	line: DocLine;
}

type Matrix = number[];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Аннотации-пометки, способные выделять вариант ответа. */
const MARKUP_ANNOTATIONS = new Set([
	'Highlight',
	'Ink',
	'Square',
	'Circle',
	'Polygon',
	'PolyLine',
	'Underline',
	'Squiggly',
	'StrikeOut'
]);

const BOLD_FONT_RE = /bold|black|heavy|semibold|demibold/i;
const ITALIC_FONT_RE = /italic|oblique/i;
const PAGE_NUMBER_RE = /^\s*(\d{1,5})\s*$/;

function splitHorizontalFragments(group: StyledItem[], pageWidth: number): StyledItem[][] {
	const sorted = [...group].sort((left, right) => left.x - right.x);
	const fragments: StyledItem[][] = [];
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

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function hasSamePageNumberPlacement(
	left: PageNumberCandidate,
	right: PageNumberCandidate
): boolean {
	const leftCenter = (left.line.x0 + left.line.x1) / 2;
	const rightCenter = (right.line.x0 + right.line.x1) / 2;
	const tolerance = Math.max(left.line.size, right.line.size) * 0.5;

	return (
		left.edge === right.edge &&
		Math.abs(leftCenter - rightCenter) <= tolerance &&
		Math.abs(left.line.y - right.line.y) <= tolerance &&
		Math.abs(left.line.size - right.line.size) <= 0.5 &&
		Math.abs(left.line.boldFrac - right.line.boldFrac) <= 0.2 &&
		Math.abs(left.line.italicFrac - right.line.italicFrac) <= 0.2
	);
}

function hasConsecutivePages(candidates: PageNumberCandidate[]): boolean {
	const pages = candidates.map(candidate => candidate.page).sort((left, right) => left - right);

	return pages.some((page, index) => index > 0 && page === pages[index - 1] + 1);
}

/**
 * Удаляет только подтверждённую серию колонтитульных номеров страниц.
 *
 * Само по себе число на краю страницы недостаточно. Серия должна повторяться
 * минимум на трёх страницах в одной позиции и одним стилем, а её значение —
 * изменяться синхронно с физическим номером страницы. Это не позволяет принять
 * за колонтитул отдельный числовой вариант ответа.
 */
export function removeConfirmedPageNumbers(lines: DocLine[]): DocLine[] {
	const indicesByPage = new Map<number, number[]>();
	for (let index = 0; index < lines.length; index++) {
		indicesByPage.set(lines[index].page, [...(indicesByPage.get(lines[index].page) ?? []), index]);
	}

	const candidates: PageNumberCandidate[] = [];
	for (const [page, indices] of indicesByPage) {
		if (indices.length < 2) continue;
		for (const [edge, index] of [
			['top', indices[0]],
			['bottom', indices[indices.length - 1]]
		] as const) {
			const line = lines[index];
			const match = PAGE_NUMBER_RE.exec(line.text);
			if (!match) continue;
			const value = Number(match[1]);
			if (!Number.isSafeInteger(value) || value < 1) continue;
			candidates.push({ index, page, edge, value, line });
		}
	}

	const placementGroups: PageNumberCandidate[][] = [];
	for (const candidate of candidates) {
		const group = placementGroups.find(current =>
			hasSamePageNumberPlacement(current[0], candidate)
		);
		if (group) group.push(candidate);
		else placementGroups.push([candidate]);
	}

	const removedIndices = new Set<number>();
	for (const group of placementGroups) {
		const byPageOffset = new Map<number, PageNumberCandidate[]>();
		for (const candidate of group) {
			const offset = candidate.value - candidate.page;
			byPageOffset.set(offset, [...(byPageOffset.get(offset) ?? []), candidate]);
		}
		for (const series of byPageOffset.values()) {
			if (series.length < 3 || !hasConsecutivePages(series)) continue;
			for (const candidate of series) removedIndices.add(candidate.index);
		}
	}

	let previousPage: number | null = null;
	return lines.flatMap((line, index) => {
		if (removedIndices.has(index)) return [];
		if (line.page !== previousPage) {
			previousPage = line.page;

			return [{ ...line, gapBefore: null }];
		}

		return [line];
	});
}

/**
 * Возвращает устойчивые начала колонок. Крупные отступы и единичные
 * центрированные заголовки не считаются колонками: каждая колонка должна иметь
 * достаточно строк и заметно пересекаться с остальными по вертикали.
 */
function detectColumnCenters(
	fragments: StyledItem[][],
	pageLeft: number,
	pageWidth: number
): number[] | null {
	if (fragments.length < 12) return null;
	const starts = fragments
		.map(fragment => Math.min(...fragment.map(item => item.x)))
		.sort((a, b) => a - b);
	const clusters: number[][] = [[]];
	for (const start of starts) {
		const current = clusters[clusters.length - 1];
		if (current.length > 0 && start - current[current.length - 1] > pageWidth * 0.14) {
			clusters.push([]);
		}
		clusters[clusters.length - 1].push(start);
	}
	if (clusters.length < 2) return null;

	const minimumClusterSize = Math.max(4, Math.floor(fragments.length * 0.08));
	while (clusters.length > 1) {
		const smallIndex = clusters.findIndex(cluster => cluster.length < minimumClusterSize);
		if (smallIndex < 0) break;
		const center = median(clusters[smallIndex]);
		const leftDistance =
			smallIndex > 0
				? Math.abs(center - median(clusters[smallIndex - 1]))
				: Number.POSITIVE_INFINITY;
		const rightDistance =
			smallIndex + 1 < clusters.length
				? Math.abs(center - median(clusters[smallIndex + 1]))
				: Number.POSITIVE_INFINITY;
		const targetIndex = leftDistance <= rightDistance ? smallIndex - 1 : smallIndex + 1;
		clusters[targetIndex].push(...clusters[smallIndex]);
		clusters[targetIndex].sort((a, b) => a - b);
		clusters.splice(smallIndex, 1);
	}
	if (clusters.length < 2 || clusters.length > 4) return null;

	const centers = clusters.map(median).sort((a, b) => a - b);
	if (centers[0] > pageLeft + pageWidth * 0.25) return null;
	// Некоторые страницы продолжают двухколоночный набор лишь на левых двух
	// третях листа, оставляя правую треть пустой (например последняя страница
	// трёхколоночного документа).
	if (centers[centers.length - 1] < pageLeft + pageWidth * 0.35) return null;
	if (centers.some((center, index) => index > 0 && center - centers[index - 1] < pageWidth * 0.2)) {
		return null;
	}

	const verticalSpans = centers.map(() => ({
		min: Number.POSITIVE_INFINITY,
		max: Number.NEGATIVE_INFINITY
	}));
	for (const fragment of fragments) {
		const x = Math.min(...fragment.map(item => item.x));
		let column = 0;
		for (let index = 1; index < centers.length; index++) {
			if (Math.abs(x - centers[index]) < Math.abs(x - centers[column])) column = index;
		}
		const y = fragment[0].y;
		verticalSpans[column].min = Math.min(verticalSpans[column].min, y);
		verticalSpans[column].max = Math.max(verticalSpans[column].max, y);
	}
	const base = verticalSpans[0];
	for (const span of verticalSpans.slice(1)) {
		const overlap = Math.max(0, Math.min(base.max, span.max) - Math.max(base.min, span.min));
		const smallerSpan = Math.min(base.max - base.min, span.max - span.min);
		if (smallerSpan <= 0 || overlap / smallerSpan < 0.4) return null;
	}

	return centers;
}

function supportsColumnHint(groups: StyledItem[][], centers: number[], pageWidth: number): boolean {
	const counts = centers.map(
		center => groups.flat().filter(item => Math.abs(item.x - center) <= pageWidth * 0.06).length
	);
	return counts.every(count => count >= 2);
}

function arrangePageGroups(
	groups: StyledItem[][],
	pageLeft: number,
	pageWidth: number,
	columnCentersHint: number[] | null
): ArrangedPageGroups {
	const fragmentsByGroup = groups.map(group => splitHorizontalFragments(group, pageWidth));
	const detectedCenters = detectColumnCenters(fragmentsByGroup.flat(), pageLeft, pageWidth);
	const centers =
		detectedCenters ??
		(columnCentersHint && supportsColumnHint(groups, columnCentersHint, pageWidth)
			? columnCentersHint
			: null);
	if (!centers) {
		return {
			groups: groups.map(items => ({ column: 0, items })),
			columnCenters: null
		};
	}

	const arranged: ColumnGroup[] = [];
	for (const group of groups) {
		const byColumn = new Map<number, StyledItem[]>();
		for (const item of group) {
			let column = 0;
			for (let index = 1; index < centers.length; index++) {
				if (item.x >= centers[index] - pageWidth * 0.04) column = index;
			}
			byColumn.set(column, [...(byColumn.get(column) ?? []), item]);
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

/** Латинские буквы, визуально неотличимые от кириллических. */
const LATIN_TO_CYRILLIC_HOMOGLYPHS: Record<string, string> = {
	a: 'а',
	c: 'с',
	e: 'е',
	o: 'о',
	p: 'р',
	x: 'х',
	y: 'у',
	k: 'к',
	A: 'А',
	B: 'В',
	C: 'С',
	E: 'Е',
	H: 'Н',
	K: 'К',
	M: 'М',
	O: 'О',
	P: 'Р',
	T: 'Т',
	X: 'Х',
	Y: 'У'
};

const CYRILLIC_TO_LATIN_HOMOGLYPHS: Record<string, string> = Object.fromEntries(
	Object.entries(LATIN_TO_CYRILLIC_HOMOGLYPHS).map(([latin, cyrillic]) => [cyrillic, latin])
);

/**
 * Исправляет смешение визуально одинаковых латинских и кириллических букв.
 * Сначала проверяет, в какой алфавит слово можно привести полностью. Если
 * допустимы оба направления, выбирает преобладающий алфавит; при равенстве
 * оставляет слово без изменений.
 */
export function fixHomoglyphs(text: string): string {
	return text.replace(/[A-Za-zА-Яа-яЁё]+/g, word => {
		const latinCharacters = word.match(/[A-Za-z]/g) ?? [];
		const cyrillicCharacters = word.match(/[А-Яа-яЁё]/g) ?? [];
		if (latinCharacters.length === 0 || cyrillicCharacters.length === 0) return word;

		const canBeCyrillic = latinCharacters.every(
			character => LATIN_TO_CYRILLIC_HOMOGLYPHS[character]
		);
		const canBeLatin = cyrillicCharacters.every(
			character => CYRILLIC_TO_LATIN_HOMOGLYPHS[character]
		);
		if (!canBeCyrillic && !canBeLatin) return word;

		const convertToCyrillic =
			canBeCyrillic && (!canBeLatin || cyrillicCharacters.length > latinCharacters.length);
		const convertToLatin =
			canBeLatin && (!canBeCyrillic || latinCharacters.length > cyrillicCharacters.length);

		if (convertToCyrillic) {
			return word.replace(
				/[A-Za-z]/g,
				character => LATIN_TO_CYRILLIC_HOMOGLYPHS[character] ?? character
			);
		}

		if (convertToLatin) {
			return word.replace(
				/[А-Яа-яЁё]/g,
				character => CYRILLIC_TO_LATIN_HOMOGLYPHS[character] ?? character
			);
		}

		return word;
	});
}

function matMul(a: Matrix, b: Matrix): Matrix {
	return [
		b[0] * a[0] + b[1] * a[2],
		b[0] * a[1] + b[1] * a[3],
		b[2] * a[0] + b[3] * a[2],
		b[2] * a[1] + b[3] * a[3],
		b[4] * a[0] + b[5] * a[2] + a[4],
		b[4] * a[1] + b[5] * a[3] + a[5]
	];
}

function matApply(m: Matrix, x: number, y: number): [number, number] {
	return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function parseHexColor(color: string | null): [number, number, number] | null {
	if (!color) return null;
	const m = /^#([0-9a-f]{6})$/i.exec(color);
	if (!m) return null;
	const v = parseInt(m[1], 16);

	return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/** Заливка, способная быть цветовым выделением: не почти белая и не почти чёрная. */
function isHighlightFill(color: string): boolean {
	const rgb = parseHexColor(color);
	if (!rgb) return false;
	const [r, g, b] = rgb;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (min >= 240) return false;
	if (max <= 70) return false;

	return true;
}

/**
 * «Цветной» пиксель картинки: с заметным оттенком, не чёрный текст и не белый
 * фон. Порог намеренно мягкий — бледные выделения тоже должны попадать в маску;
 * ложные срабатывания шума отсекаются требованием вертикальной сплошности.
 */
function isColoredPixel(r: number, g: number, b: number, brightnessFloor: number): boolean {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);

	return max - min > 22 && max > brightnessFloor && min < 250;
}

function toHex(n: number): string {
	return Math.max(0, Math.min(255, Math.round(n)))
		.toString(16)
		.padStart(2, '0');
}

/** Нормализует аргумент цветового оператора pdf.js к #rrggbb. */
function normalizeColorArg(args: unknown[]): string | null {
	if (!args || args.length === 0) return null;
	const first = args[0];
	if (typeof first === 'string') return /^#[0-9a-f]{6}$/i.test(first) ? first.toLowerCase() : null;
	if (typeof first === 'number') {
		if (args.length >= 3 && typeof args[1] === 'number' && typeof args[2] === 'number') {
			return `#${toHex(first)}${toHex(args[1] as number)}${toHex(args[2] as number)}`;
		}
		const gray = first <= 1 ? first * 255 : first;

		return `#${toHex(gray)}${toHex(gray)}${toHex(gray)}`;
	}

	return null;
}

interface PageGraphics {
	fills: FillRect[];
	imagePaints: ImagePaint[];
	runs: TextRun[];
	annotationIdsWithAppearance: Set<string>;
}

/** Обход operator list: заливки, картинки и текстовые прогоны с цветом. */
function walkOperatorList(
	fnArray: number[],
	argsArray: unknown[],
	ops: Record<string, number>,
	pageArea: number
): PageGraphics {
	const byCode = new Map<number, string>();
	for (const [name, code] of Object.entries(ops)) byCode.set(code, name);
	const fillOps = new Set(
		['fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke']
			.map(n => ops[n])
			.filter(c => c !== undefined)
	);

	const fills: FillRect[] = [];
	const imagePaints: ImagePaint[] = [];
	const runs: TextRun[] = [];
	const annotationIdsWithAppearance = new Set<string>();

	let ctm = IDENTITY;
	let fillColor: string | null = '#000000';
	const stack: { ctm: Matrix; fillColor: string | null }[] = [];
	const annotationStack: {
		id: string | null;
		ctm: Matrix;
		fillColor: string | null;
		graphicsStackDepth: number;
	}[] = [];

	for (let i = 0; i < fnArray.length; i++) {
		const name = byCode.get(fnArray[i]);
		const args = argsArray[i] as unknown[];

		switch (name) {
			case 'save':
				stack.push({ ctm, fillColor });
				break;
			case 'restore': {
				const stackFloor = annotationStack.at(-1)?.graphicsStackDepth ?? 0;
				const s = stack.length > stackFloor ? stack.pop() : undefined;
				if (s) ({ ctm, fillColor } = s);
				break;
			}
			case 'transform':
				if (Array.isArray(args) && args.length >= 6) ctm = matMul(ctm, args as Matrix);
				break;
			case 'paintFormXObjectBegin':
				stack.push({ ctm, fillColor });
				if (Array.isArray(args) && Array.isArray(args[0])) ctm = matMul(ctm, args[0] as Matrix);
				break;
			case 'paintFormXObjectEnd': {
				const stackFloor = annotationStack.at(-1)?.graphicsStackDepth ?? 0;
				const s = stack.length > stackFloor ? stack.pop() : undefined;
				if (s) ({ ctm, fillColor } = s);
				break;
			}
			case 'beginAnnotation': {
				annotationStack.push({
					id: typeof args?.[0] === 'string' ? args[0] : null,
					ctm,
					fillColor,
					graphicsStackDepth: stack.length
				});
				// pdf.js рисует appearance stream аннотации в отдельном начальном
				// graphics state и последовательно применяет transform и matrix.
				ctm = IDENTITY;
				if (Array.isArray(args?.[2]) && args[2].length >= 6) {
					ctm = matMul(ctm, args[2] as Matrix);
				}
				if (Array.isArray(args?.[3]) && args[3].length >= 6) {
					ctm = matMul(ctm, args[3] as Matrix);
				}
				fillColor = '#000000';
				break;
			}
			case 'endAnnotation': {
				const annotation = annotationStack.pop();
				if (annotation) {
					stack.length = annotation.graphicsStackDepth;
					ctm = annotation.ctm;
					fillColor = annotation.fillColor;
				}
				break;
			}
			case 'setFillRGBColor':
			case 'setFillGray':
			case 'setFillCMYKColor':
				fillColor = normalizeColorArg(args) ?? fillColor;
				break;
			case 'setFillColorN':
				fillColor = normalizeColorArg(args);
				break;
			case 'constructPath': {
				if (!Array.isArray(args) || args.length < 3) break;
				const paintOp = args[0];
				if (typeof paintOp !== 'number' || !fillOps.has(paintOp)) break;
				if (!fillColor || !isHighlightFill(fillColor)) break;
				const minMax = args[2] as ArrayLike<number> | undefined;
				if (!minMax || minMax.length !== 4) break;
				const p1 = matApply(ctm, minMax[0], minMax[1]);
				const p2 = matApply(ctm, minMax[2], minMax[3]);
				const box: Box = {
					x0: Math.min(p1[0], p2[0]),
					y0: Math.min(p1[1], p2[1]),
					x1: Math.max(p1[0], p2[0]),
					y1: Math.max(p1[1], p2[1])
				};
				// Заливка размером со страницу — фон, а не выделение.
				if ((box.x1 - box.x0) * (box.y1 - box.y0) >= pageArea * 0.5) break;
				fills.push({ ...box, color: fillColor });
				const annotationId = annotationStack.at(-1)?.id;
				if (annotationId) annotationIdsWithAppearance.add(annotationId);
				break;
			}
			case 'paintImageXObject': {
				if (!Array.isArray(args) || typeof args[0] !== 'string') break;
				const corners = [
					matApply(ctm, 0, 0),
					matApply(ctm, 1, 0),
					matApply(ctm, 0, 1),
					matApply(ctm, 1, 1)
				];
				const xs = corners.map(point => point[0]);
				const ys = corners.map(point => point[1]);
				imagePaints.push({
					id: args[0],
					annotationId: annotationStack.at(-1)?.id ?? null,
					box: {
						x0: Math.min(...xs),
						y0: Math.min(...ys),
						x1: Math.max(...xs),
						y1: Math.max(...ys)
					}
				});
				break;
			}
			case 'showText': {
				// Текст appearance stream отсутствует в getTextContent и нарушит
				// позиционное сопоставление текстовых прогонов с элементами страницы.
				if (annotationStack.length > 0) break;
				if (!Array.isArray(args) || !Array.isArray(args[0])) break;
				let chars = '';
				for (const g of args[0] as unknown[]) {
					if (g && typeof g === 'object') chars += (g as { unicode?: string }).unicode ?? '';
				}
				if (chars) runs.push({ chars, color: fillColor });
				break;
			}
		}
	}

	return { fills, imagePaints, runs, annotationIdsWithAppearance };
}

/** Ожидает объект картинки из page.objs с таймаутом (декодируется асинхронно). */
function resolveImage(
	page: PdfPage,
	id: string,
	timeoutMs: number
): Promise<PdfImageObject | null> {
	return new Promise(resolve => {
		const timer = setTimeout(() => resolve(null), timeoutMs);
		try {
			page.objs.get(id, obj => {
				clearTimeout(timer);
				resolve((obj as PdfImageObject) ?? null);
			});
		} catch {
			clearTimeout(timer);
			resolve(null);
		}
	});
}

/**
 * Строит загрублённую маску цветных областей картинки. Ячейка считается
 * выделенной по ДОЛЕ цветных пикселей в своём блоке, а не по одному пикселю, —
 * так переживают даунсемплинг бледные и «зернистые» (полупрозрачные) выделения,
 * а редкий шум сжатия не набирает нужной плотности.
 */
function buildImageRegion(
	image: PdfImageObject,
	box: Box,
	brightnessFloor: number
): ImageRegion | null {
	const { width, height, data } = image;
	if (!width || !height || !data) return null;
	const channels = Math.round(data.length / (width * height));
	if (channels !== 3 && channels !== 4) return null;

	const gw = Math.min(width, 480);
	const gh = Math.min(height, 3200);
	const colored = new Uint32Array(gw * gh);
	const total = new Uint32Array(gw * gh);
	for (let sy = 0; sy < height; sy++) {
		const gy = Math.min(gh - 1, Math.floor((sy * gh) / height));
		const rowCell = gy * gw;
		const rowPix = sy * width;
		for (let sx = 0; sx < width; sx++) {
			const o = (rowPix + sx) * channels;
			// Полупрозрачные выделения приходят с невысокой альфой (порядка 90/255),
			// поэтому отсекаем лишь почти полностью прозрачные пиксели.
			if (channels === 4 && data[o + 3] < 40) continue;
			const cell = rowCell + Math.min(gw - 1, Math.floor((sx * gw) / width));
			total[cell]++;
			if (isColoredPixel(data[o], data[o + 1], data[o + 2], brightnessFloor)) {
				colored[cell]++;
			}
		}
	}

	const grid = new Uint8Array(gw * gh);
	for (let i = 0; i < grid.length; i++) {
		if (total[i] > 0 && colored[i] / total[i] >= 0.1) grid[i] = 1;
	}

	return { ...box, gw, gh, grid };
}

/** Сопоставляет цвета текстовых прогонов элементам getTextContent (оба идут в порядке стрима). */
function assignColors(items: StyledItem[], runs: TextRun[]): void {
	const chars: { ch: string; color: string | null }[] = [];
	for (const run of runs) {
		for (const ch of run.chars) {
			if (!/\s/.test(ch)) chars.push({ ch, color: run.color });
		}
	}

	let cursor = 0;
	for (const item of items) {
		const counts = new Map<string, number>();
		for (const ch of item.str) {
			if (/\s/.test(ch)) continue;
			let hit = -1;
			for (let k = cursor; k < Math.min(cursor + 4, chars.length); k++) {
				if (chars[k].ch === ch) {
					hit = k;
					break;
				}
			}
			if (hit < 0) continue;
			cursor = hit + 1;
			const color = chars[hit].color;
			if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
		}
		let best = 0;
		for (const [color, n] of counts) {
			if (n > best) {
				best = n;
				item.color = color;
			}
		}
	}
}

function boxContains(box: Box, x: number, y: number): boolean {
	return x >= box.x0 - 0.5 && x <= box.x1 + 0.5 && y >= box.y0 - 0.5 && y <= box.y1 + 0.5;
}

/** Есть ли цветной пиксель картинки в точке страницы. */
function imageColoredAt(region: ImageRegion, x: number, y: number): boolean {
	const width = region.x1 - region.x0;
	const height = region.y1 - region.y0;
	if (width <= 0 || height <= 0) return false;
	if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) return false;
	const gx = Math.min(
		region.gw - 1,
		Math.max(0, Math.floor(((x - region.x0) / width) * region.gw))
	);
	const gy = Math.min(
		region.gh - 1,
		Math.max(0, Math.floor(((region.y1 - y) / height) * region.gh))
	);

	return region.grid[gy * region.gw + gx] === 1;
}

/**
 * Доля площади бокса строки, занятая цветным выделением из любого источника
 * (заливки, аннотации, картинки-подложки). Мера двумерная: сильное сплошное
 * выделение даёт большую долю, бледное/тонкое (подчёркивание, зернистый скан) —
 * меньшую, но ненулевую, а однопиксельный «затёк» выделения соседней строки —
 * пренебрежимо малую. Итоговое «выделен ли вариант» решается уже относительно
 * братьев в вопросе при применении синтаксического профиля документа.
 */
function measureHighlight(
	x0: number,
	x1: number,
	y: number,
	size: number,
	fills: FillRect[],
	annotationBoxes: Box[],
	imageRegions: ImageRegion[]
): number {
	const lineWidth = x1 - x0;
	if (lineWidth <= 0) return 0;

	const rows = 9;
	const yLo = y - size * 0.25;
	const yHi = y + size * 0.85;
	const cols = Math.max(16, Math.min(400, Math.round(lineWidth / 1.5)));

	let colored = 0;
	const totalPoints = rows * cols;
	for (let c = 0; c < cols; c++) {
		const x = x0 + (lineWidth * (c + 0.5)) / cols;
		for (let r = 0; r < rows; r++) {
			const yy = yLo + ((yHi - yLo) * (r + 0.5)) / rows;
			let on = false;
			for (const rect of fills) {
				if (boxContains(rect, x, yy)) {
					on = true;
					break;
				}
			}
			if (!on) {
				for (const box of annotationBoxes) {
					if (boxContains(box, x, yy)) {
						on = true;
						break;
					}
				}
			}
			if (!on) {
				for (const region of imageRegions) {
					if (imageColoredAt(region, x, yy)) {
						on = true;
						break;
					}
				}
			}
			if (on) colored++;
		}
	}

	return colored / totalPoints;
}

async function extractPage(
	page: PdfPage,
	pageNumber: number,
	pdfjs: PdfJsModule,
	columnCentersHint: number[] | null
): Promise<{ lines: DocLine[]; columnCenters: number[] | null }> {
	const view = page.view;
	const pageLeft = Math.min(view[0], view[2]);
	const pageWidth = Math.abs(view[2] - view[0]);
	const pageArea = Math.abs((view[2] - view[0]) * (view[3] - view[1]));

	const opList = await page.getOperatorList();
	const { fills, imagePaints, runs, annotationIdsWithAppearance } = walkOperatorList(
		opList.fnArray,
		opList.argsArray,
		pdfjs.OPS,
		pageArea
	);

	const imageRegions: ImageRegion[] = [];
	for (const { id, box, annotationId } of imagePaints) {
		const image = await resolveImage(page, id, 3000);
		if (!image) continue;
		// В appearance stream полупрозрачный маркер иногда хранится как тёмный
		// RGB (около 64–128) плюс alpha. Для обычных изображений оставляем
		// более строгий порог, чтобы не считать цветные иллюстрации маркером.
		const region = buildImageRegion(image, box, annotationId ? 60 : 100);
		if (region) {
			imageRegions.push(region);
			if (annotationId) annotationIdsWithAppearance.add(annotationId);
		}
	}

	const annotations = await page.getAnnotations();
	const annotationBoxes: Box[] = [];
	for (const a of annotations) {
		if (!a.subtype || !MARKUP_ANNOTATIONS.has(a.subtype)) continue;
		// Если appearance stream удалось извлечь, используем его точную маску.
		// Прямоугольник всей Stamp/Square-аннотации часто охватывает полстраницы.
		if (a.id && annotationIdsWithAppearance.has(a.id)) continue;
		const r = a.rect;
		if (!r || r.length !== 4) continue;
		annotationBoxes.push({
			x0: Math.min(r[0], r[2]),
			y0: Math.min(r[1], r[3]),
			x1: Math.max(r[0], r[2]),
			y1: Math.max(r[1], r[3])
		});
	}

	const textContent = await page.getTextContent();
	const items: StyledItem[] = [];
	for (const it of textContent.items) {
		if (typeof it.str !== 'string' || !it.transform) continue;
		items.push({
			str: it.str,
			x: it.transform[4],
			y: it.transform[5],
			w: it.width ?? 0,
			size: Math.hypot(it.transform[0], it.transform[1]),
			fontName: it.fontName ?? '',
			color: null
		});
	}
	assignColors(items, runs);

	// Реальные имена шрифтов — для определения жирности/курсива.
	const fontFlags = new Map<string, { bold: boolean; italic: boolean }>();
	for (const name of new Set(items.map(i => i.fontName))) {
		let realName = '';
		try {
			const font = page.commonObjs.get(name) as { name?: string } | null;
			realName = font?.name ?? '';
		} catch {
			realName = '';
		}
		fontFlags.set(name, {
			bold: BOLD_FONT_RE.test(realName),
			italic: ITALIC_FONT_RE.test(realName)
		});
	}

	// Сборка строк: группировка по базовой линии, сортировка, склейка текста.
	const visible = items.filter(i => i.str.trim() !== '');
	visible.sort((a, b) => b.y - a.y || a.x - b.x);
	const groups: StyledItem[][] = [];
	for (const item of visible) {
		const last = groups[groups.length - 1];
		if (last && Math.abs(last[0].y - item.y) <= Math.max(2, item.size * 0.45)) last.push(item);
		else groups.push([item]);
	}

	const lines: DocLine[] = [];
	const lineColumns: number[] = [];
	const arrangedPage = arrangePageGroups(groups, pageLeft, pageWidth, columnCentersHint);
	for (const arranged of arrangedPage.groups) {
		const group = arranged.items;
		group.sort((a, b) => a.x - b.x);
		let text = '';
		let prev: StyledItem | null = null;
		for (const item of group) {
			if (prev) {
				const gap = item.x - (prev.x + prev.w);
				if (
					gap > Math.max(0.8, prev.size * 0.14) &&
					!text.endsWith(' ') &&
					!item.str.startsWith(' ')
				) {
					text += ' ';
				}
			}
			text += item.str;
			prev = item;
		}

		text = fixHomoglyphs(text);

		const x0 = group[0].x;
		const x1 = Math.max(...group.map(i => i.x + i.w));
		const size = Math.max(...group.map(i => i.size));
		const y = group[0].y;

		let totalLen = 0;
		let boldLen = 0;
		let italicLen = 0;
		const colorWeights = new Map<string, number>();
		for (const item of group) {
			const len = item.str.replace(/\s/g, '').length;
			totalLen += len;
			const flags = fontFlags.get(item.fontName);
			if (flags?.bold) boldLen += len;
			if (flags?.italic) italicLen += len;
			if (item.color) colorWeights.set(item.color, (colorWeights.get(item.color) ?? 0) + len);
		}
		let color: string | null = null;
		let colorBest = 0;
		for (const [c, n] of colorWeights) {
			if (n > colorBest) {
				colorBest = n;
				color = c;
			}
		}

		const highlightFrac = measureHighlight(x0, x1, y, size, fills, annotationBoxes, imageRegions);

		lines.push({
			page: pageNumber,
			y,
			x0,
			x1,
			size,
			text,
			boldFrac: totalLen > 0 ? boldLen / totalLen : 0,
			italicFrac: totalLen > 0 ? italicLen / totalLen : 0,
			color,
			highlightFrac,
			gapBefore: null
		});
		lineColumns.push(arranged.column);
	}

	for (let i = 1; i < lines.length; i++) {
		lines[i].gapBefore = lineColumns[i] === lineColumns[i - 1] ? lines[i - 1].y - lines[i].y : null;
	}

	return { lines, columnCenters: arrangedPage.columnCenters };
}

/**
 * Извлекает из PDF строки с визуальными атрибутами в порядке чтения
 * (страницы подряд, сверху вниз).
 */
export async function extractPdfLines(data: Buffer): Promise<DocLine[]> {
	const pdfjs = loadPdfJs();
	const task = pdfjs.getDocument({
		data: new Uint8Array(data),
		verbosity: 0,
		isEvalSupported: false
	});

	try {
		const doc = await task.promise;
		const lines: DocLine[] = [];
		let columnCentersHint: number[] | null = null;
		for (let p = 1; p <= doc.numPages; p++) {
			const page = await extractPage(await doc.getPage(p), p, pdfjs, columnCentersHint);
			lines.push(...page.lines);
			columnCentersHint = page.columnCenters;
		}

		return removeConfirmedPageNumbers(lines);
	} finally {
		await task.destroy().catch(() => undefined);
	}
}
