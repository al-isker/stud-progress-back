/** Аффинная матрица PDF: [a, b, c, d, e, f]. */
export type PdfMatrix = number[];

export interface PdfPoint {
	x: number;
	y: number;
}

export interface PdfBox {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

interface HighlightShapeBase extends PdfBox {
	sourceId: string;
	/** Активные clipping paths в момент отрисовки фигуры. */
	clips?: HighlightShape[];
}

interface FillShape extends HighlightShapeBase {
	kind: 'fill';
	contours: PdfPoint[][];
	evenOdd: boolean;
}

interface StrokeShape extends HighlightShapeBase {
	kind: 'stroke';
	lines: PdfPoint[][];
	radius: number;
}

export type HighlightShape = FillShape | StrokeShape;

interface Interval {
	x0: number;
	x1: number;
}

const CURVE_TOLERANCE = 0.1;
const MAX_CURVE_DEPTH = 12;
// pdf.js вычисляет annotation/Form transforms через Float32-координаты. Такое
// округление даёт микроскопическое расхождение двух номинально равных scale.
const SIMILARITY_RELATIVE_TOLERANCE = 1e-5;

export function applyPdfMatrix(matrix: PdfMatrix, x: number, y: number): PdfPoint {
	return {
		x: matrix[0] * x + matrix[2] * y + matrix[4],
		y: matrix[1] * x + matrix[3] * y + matrix[5]
	};
}

export function invertPdfMatrix(matrix: PdfMatrix): PdfMatrix | null {
	const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2];
	if (Math.abs(determinant) < 1e-12) return null;

	return [
		matrix[3] / determinant,
		-matrix[1] / determinant,
		-matrix[2] / determinant,
		matrix[0] / determinant,
		(matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
		(matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant
	];
}

export function boxFromTransformedUnitSquare(matrix: PdfMatrix): PdfBox {
	const corners = [
		applyPdfMatrix(matrix, 0, 0),
		applyPdfMatrix(matrix, 1, 0),
		applyPdfMatrix(matrix, 0, 1),
		applyPdfMatrix(matrix, 1, 1)
	];

	return boxOfPoints(corners);
}

function boxOfPoints(points: PdfPoint[]): PdfBox {
	return {
		x0: Math.min(...points.map(point => point.x)),
		y0: Math.min(...points.map(point => point.y)),
		x1: Math.max(...points.map(point => point.x)),
		y1: Math.max(...points.map(point => point.y))
	};
}

function distanceToLine(point: PdfPoint, from: PdfPoint, to: PdfPoint): number {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.hypot(dx, dy);
	if (length === 0) return Math.hypot(point.x - from.x, point.y - from.y);

	return Math.abs(dy * point.x - dx * point.y + to.x * from.y - to.y * from.x) / length;
}

function midpoint(a: PdfPoint, b: PdfPoint): PdfPoint {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenCubic(
	from: PdfPoint,
	control1: PdfPoint,
	control2: PdfPoint,
	to: PdfPoint,
	output: PdfPoint[],
	depth = 0
): void {
	if (
		depth >= MAX_CURVE_DEPTH ||
		Math.max(distanceToLine(control1, from, to), distanceToLine(control2, from, to)) <=
			CURVE_TOLERANCE
	) {
		output.push(to);
		return;
	}
	const a = midpoint(from, control1);
	const b = midpoint(control1, control2);
	const c = midpoint(control2, to);
	const d = midpoint(a, b);
	const e = midpoint(b, c);
	const center = midpoint(d, e);
	flattenCubic(from, a, d, center, output, depth + 1);
	flattenCubic(center, e, c, to, output, depth + 1);
}

function flattenQuadratic(
	from: PdfPoint,
	control: PdfPoint,
	to: PdfPoint,
	output: PdfPoint[],
	depth = 0
): void {
	if (depth >= MAX_CURVE_DEPTH || distanceToLine(control, from, to) <= CURVE_TOLERANCE) {
		output.push(to);
		return;
	}
	const a = midpoint(from, control);
	const b = midpoint(control, to);
	const center = midpoint(a, b);
	flattenQuadratic(from, a, center, output, depth + 1);
	flattenQuadratic(center, b, to, output, depth + 1);
}

function finitePoint(point: PdfPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Декодирует центральные линии внутреннего DrawOPS-пути pdf.js. */
function decodePdfPath(data: ArrayLike<number>, matrix: PdfMatrix): PdfPoint[][] | null {
	const contours: PdfPoint[][] = [];
	let contour: PdfPoint[] | null = null;
	let current: PdfPoint | null = null;
	let cursor = 0;
	const readPoint = (): PdfPoint | null => {
		if (cursor + 1 >= data.length) return null;
		const point = applyPdfMatrix(matrix, data[cursor++], data[cursor++]);

		return finitePoint(point) ? point : null;
	};
	const finishContour = (closed = false): void => {
		if (closed && contour && contour.length >= 2) contour.push(contour[0]);
		if (contour && contour.length >= 2) contours.push(contour);
		contour = null;
	};

	while (cursor < data.length) {
		const operation = data[cursor++];
		switch (operation) {
			case 0: {
				finishContour();
				const point = readPoint();
				if (!point) return null;
				contour = [point];
				current = point;
				break;
			}
			case 1: {
				const point = readPoint();
				if (!point || !contour || !current) return null;
				contour.push(point);
				current = point;
				break;
			}
			case 2: {
				const control1 = readPoint();
				const control2 = readPoint();
				const point = readPoint();
				if (!control1 || !control2 || !point || !contour || !current) return null;
				flattenCubic(current, control1, control2, point, contour);
				current = point;
				break;
			}
			case 3: {
				const control = readPoint();
				const point = readPoint();
				if (!control || !point || !contour || !current) return null;
				flattenQuadratic(current, control, point, contour);
				current = point;
				break;
			}
			case 4:
				finishContour(true);
				current = null;
				break;
			default:
				return null;
		}
	}
	finishContour();

	return contours;
}

/**
 * Декодирует внутренний DrawOPS-путь pdf.js. Bounding box здесь используется
 * только для быстрого отбора; принадлежность точки считается по самому контуру.
 */
export function decodePdfFillShape(
	data: ArrayLike<number>,
	matrix: PdfMatrix,
	evenOdd: boolean,
	sourceId: string
): HighlightShape | null {
	const contours = decodePdfPath(data, matrix);
	if (!contours) return null;
	const points = contours.flat();
	if (points.length < 3) return null;

	return { kind: 'fill', contours, evenOdd, sourceId, ...boxOfPoints(points) };
}

/**
 * Декодирует stroke только при геометрически точной поддержке: круглый cap/join
 * и similarity-transform. При skew/неравномерном scale круглый штрих становится
 * эллиптическим, поэтому вместо неточной аппроксимации вызывающий код reject'ит
 * пересекающийся вопрос.
 */
export function decodePdfStrokeShape(
	data: ArrayLike<number>,
	matrix: PdfMatrix,
	width: number,
	lineCap: number,
	lineJoin: number,
	sourceId: string
): HighlightShape | null {
	if (!Number.isFinite(width) || width <= 0 || lineCap !== 1) return null;
	const scaleX = Math.hypot(matrix[0], matrix[1]);
	const scaleY = Math.hypot(matrix[2], matrix[3]);
	const dot = matrix[0] * matrix[2] + matrix[1] * matrix[3];
	const scale = (scaleX + scaleY) / 2;
	const tolerance = Math.max(1, scaleX * scaleY) * SIMILARITY_RELATIVE_TOLERANCE;
	if (
		!Number.isFinite(scale) ||
		scale <= 0 ||
		Math.abs(scaleX - scaleY) > Math.max(scaleX, scaleY, 1) * SIMILARITY_RELATIVE_TOLERANCE ||
		Math.abs(dot) > tolerance
	) {
		return null;
	}
	const lines = decodePdfPath(data, matrix);
	if (!lines) return null;
	// При одном сегменте соединения нет. Для ломаной текущая точная геометрия
	// моделирует круглый join; miter/bevel оставляем вызывающему коду как ambiguity.
	if (lineJoin !== 1 && lines.some(line => line.length > 2)) return null;
	const points = lines.flat();
	if (points.length < 2) return null;
	const radius = (width * scale) / 2;
	const box = boxOfPoints(points);

	return {
		kind: 'stroke',
		lines,
		radius,
		sourceId,
		x0: box.x0 - radius,
		y0: box.y0 - radius,
		x1: box.x1 + radius,
		y1: box.y1 + radius
	};
}

/** Точная геометрия четырёхугольников Highlight-аннотации. */
export function createQuadFillShape(
	quadPoints: ArrayLike<number>,
	sourceId: string
): HighlightShape | null {
	if (quadPoints.length === 0 || quadPoints.length % 8 !== 0) return null;
	const contours: PdfPoint[][] = [];
	for (let offset = 0; offset < quadPoints.length; offset += 8) {
		// PDF хранит точки как top-left, top-right, bottom-left, bottom-right.
		const contour = [
			{ x: quadPoints[offset], y: quadPoints[offset + 1] },
			{ x: quadPoints[offset + 2], y: quadPoints[offset + 3] },
			{ x: quadPoints[offset + 6], y: quadPoints[offset + 7] },
			{ x: quadPoints[offset + 4], y: quadPoints[offset + 5] }
		];
		if (!contour.every(finitePoint)) return null;
		contours.push(contour);
	}
	const points = contours.flat();

	return { kind: 'fill', contours, evenOdd: false, sourceId, ...boxOfPoints(points) };
}

/**
 * Делит один PDF fill-op на самостоятельные связные области. Несколько
 * контуров могут описывать одну область с отверстием, поэтому пересекающиеся
 * bounding box остаются вместе; заведомо разнесённые контуры получают разные
 * идентификаторы источника.
 */
export function splitDisconnectedFillShape(shape: HighlightShape): HighlightShape[] {
	if (shape.kind !== 'fill' || shape.contours.length <= 1) return [shape];
	const boxes = shape.contours.map(boxOfPoints);
	const unvisited = new Set(shape.contours.map((_, index) => index));
	const groups: number[][] = [];
	const tolerance = CURVE_TOLERANCE;
	const boxesMayConnect = (left: PdfBox, right: PdfBox) =>
		left.x0 <= right.x1 + tolerance &&
		left.x1 + tolerance >= right.x0 &&
		left.y0 <= right.y1 + tolerance &&
		left.y1 + tolerance >= right.y0;

	while (unvisited.size > 0) {
		const start = unvisited.values().next().value as number;
		unvisited.delete(start);
		const group = [start];
		for (let cursor = 0; cursor < group.length; cursor++) {
			for (const candidate of [...unvisited]) {
				if (!boxesMayConnect(boxes[group[cursor]], boxes[candidate])) continue;
				unvisited.delete(candidate);
				group.push(candidate);
			}
		}
		groups.push(group);
	}

	if (groups.length === 1) return [shape];

	return groups.map((group, groupIndex) => {
		const contours = group.map(index => shape.contours[index]);
		const box = boxOfPoints(contours.flat());

		return {
			kind: 'fill',
			contours,
			evenOdd: shape.evenOdd,
			sourceId: `${shape.sourceId}:${groupIndex + 1}`,
			clips: shape.clips,
			...box
		};
	});
}

/**
 * Проверяет, что fill действительно закрывает весь прямоугольник, а не только
 * имеет такой же bounding box. Между соседними Y-вершинами границы полигонов
 * линейны, поэтому достаточно проверить внутренние точки каждого такого слоя.
 */
export function fillShapeCoversBox(shape: HighlightShape, box: PdfBox): boolean {
	if (
		shape.kind !== 'fill' ||
		shape.x0 > box.x0 ||
		shape.y0 > box.y0 ||
		shape.x1 < box.x1 ||
		shape.y1 < box.y1
	) {
		return false;
	}
	const clippingContours = (shape.clips ?? []).flatMap(clip =>
		clip.kind === 'fill' ? clip.contours : []
	);
	const criticalY = [
		box.y0,
		box.y1,
		...shape.contours.flatMap(contour => contour.map(point => point.y)),
		...clippingContours.flatMap(contour => contour.map(point => point.y))
	]
		.filter(y => y >= box.y0 && y <= box.y1)
		.sort((left, right) => left - right)
		.filter((y, index, values) => index === 0 || y !== values[index - 1]);
	const coversScanline = (y: number): boolean => {
		const intervals = highlightSourceIntervalsAtY([shape], y, box.x0, box.x1).flatMap(source =>
			source.intervals.map(([x0, x1]) => ({ x0, x1 }))
		);
		const merged = mergeIntervals(intervals);
		if (merged.length === 0) return false;
		let coveredUntil = box.x0;
		for (const interval of merged) {
			if (interval.x0 > coveredUntil) return false;
			coveredUntil = Math.max(coveredUntil, interval.x1);
			if (coveredUntil >= box.x1) return true;
		}

		return false;
	};

	for (let index = 1; index < criticalY.length; index++) {
		const y0 = criticalY[index - 1];
		const y1 = criticalY[index];
		if (y1 <= y0) continue;
		const inset = (y1 - y0) * 1e-6;
		for (const y of [y0 + inset, (y0 + y1) / 2, y1 - inset]) {
			if (!coversScanline(y)) return false;
		}
	}

	return criticalY.length >= 2;
}

function polygonIntervalsAtY(points: PdfPoint[], y: number): Interval[] {
	const intersections: number[] = [];
	for (let index = 0; index < points.length; index++) {
		const from = points[index];
		const to = points[(index + 1) % points.length];
		if ((from.y <= y && to.y > y) || (to.y <= y && from.y > y)) {
			intersections.push(from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y));
		}
	}
	intersections.sort((a, b) => a - b);
	const intervals: Interval[] = [];
	for (let index = 0; index + 1 < intersections.length; index += 2) {
		intervals.push({ x0: intersections[index], x1: intersections[index + 1] });
	}

	return intervals;
}

function fillIntervalsAtY(shape: FillShape, y: number): Interval[] {
	if (shape.evenOdd) {
		const intersections = shape.contours
			.flatMap(contour => polygonIntervalsAtY(contour, y))
			.flatMap(interval => [interval.x0, interval.x1])
			.sort((a, b) => a - b);

		return Array.from({ length: Math.floor(intersections.length / 2) }, (_, index) => ({
			x0: intersections[index * 2],
			x1: intersections[index * 2 + 1]
		}));
	}
	const events: Array<{ x: number; delta: number }> = [];
	for (const contour of shape.contours) {
		for (let index = 0; index < contour.length; index++) {
			const from = contour[index];
			const to = contour[(index + 1) % contour.length];
			if (from.y <= y && to.y > y) {
				events.push({ x: from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y), delta: 1 });
			} else if (to.y <= y && from.y > y) {
				events.push({ x: from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y), delta: -1 });
			}
		}
	}
	events.sort((a, b) => a.x - b.x || a.delta - b.delta);
	const intervals: Interval[] = [];
	let winding = 0;
	let start: number | null = null;
	for (const event of events) {
		const before = winding;
		winding += event.delta;
		if (before === 0 && winding !== 0) start = event.x;
		if (before !== 0 && winding === 0 && start !== null) {
			intervals.push({ x0: start, x1: event.x });
			start = null;
		}
	}

	return intervals;
}

function strokeIntervalsAtY(shape: StrokeShape, y: number): Interval[] {
	const intervals: Interval[] = [];
	for (const points of shape.lines) {
		for (const point of points) {
			const dy = Math.abs(y - point.y);
			if (dy <= shape.radius) {
				const dx = Math.sqrt(Math.max(0, shape.radius ** 2 - dy ** 2));
				intervals.push({ x0: point.x - dx, x1: point.x + dx });
			}
		}
		for (let index = 1; index < points.length; index++) {
			const from = points[index - 1];
			const to = points[index];
			const length = Math.hypot(to.x - from.x, to.y - from.y);
			if (length === 0) continue;
			const nx = (-(to.y - from.y) / length) * shape.radius;
			const ny = ((to.x - from.x) / length) * shape.radius;
			intervals.push(
				...polygonIntervalsAtY(
					[
						{ x: from.x + nx, y: from.y + ny },
						{ x: to.x + nx, y: to.y + ny },
						{ x: to.x - nx, y: to.y - ny },
						{ x: from.x - nx, y: from.y - ny }
					],
					y
				)
			);
		}
	}

	return intervals;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
	const sorted = intervals
		.filter(interval => interval.x1 > interval.x0)
		.sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
	const merged: Interval[] = [];
	for (const interval of sorted) {
		const last = merged.at(-1);
		if (!last || interval.x0 > last.x1) merged.push({ ...interval });
		else last.x1 = Math.max(last.x1, interval.x1);
	}

	return merged;
}

function intersectIntervals(left: Interval[], right: Interval[]): Interval[] {
	const intersections: Interval[] = [];
	let leftIndex = 0;
	let rightIndex = 0;
	while (leftIndex < left.length && rightIndex < right.length) {
		const x0 = Math.max(left[leftIndex].x0, right[rightIndex].x0);
		const x1 = Math.min(left[leftIndex].x1, right[rightIndex].x1);
		if (x1 > x0) intersections.push({ x0, x1 });
		if (left[leftIndex].x1 < right[rightIndex].x1) leftIndex++;
		else rightIndex++;
	}

	return intersections;
}

/** Горизонтальные интервалы каждого самостоятельного источника выделения. */
export function highlightSourceIntervalsAtY(
	shapes: HighlightShape[],
	y: number,
	x0: number,
	x1: number
): Array<{ sourceId: string; intervals: Array<[number, number]> }> {
	return shapes.flatMap(shape => {
		if (y < shape.y0 || y > shape.y1 || x1 < shape.x0 || x0 > shape.x1) return [];
		let intervals =
			shape.kind === 'fill' ? fillIntervalsAtY(shape, y) : strokeIntervalsAtY(shape, y);
		for (const clip of shape.clips ?? []) {
			if (clip.kind !== 'fill') continue;
			intervals = intersectIntervals(
				mergeIntervals(intervals),
				mergeIntervals(fillIntervalsAtY(clip, y))
			);
			if (intervals.length === 0) break;
		}
		const clipped = mergeIntervals(intervals)
			.map(interval => [Math.max(x0, interval.x0), Math.min(x1, interval.x1)] as [number, number])
			.filter(interval => interval[1] > interval[0]);

		return clipped.length > 0 ? [{ sourceId: shape.sourceId, intervals: clipped }] : [];
	});
}

/** Объединённые горизонтальные интервалы всех маркеров на заданной высоте. */
export function highlightIntervalsAtY(
	shapes: HighlightShape[],
	y: number,
	x0: number,
	x1: number
): Array<[number, number]> {
	const intervals = highlightSourceIntervalsAtY(shapes, y, x0, x1).flatMap(source =>
		source.intervals.map(([intervalX0, intervalX1]) => ({ x0: intervalX0, x1: intervalX1 }))
	);

	return mergeIntervals(intervals)
		.map(interval => [Math.max(x0, interval.x0), Math.min(x1, interval.x1)] as [number, number])
		.filter(interval => interval[1] > interval[0]);
}

export function pointInIntervals(intervals: Array<[number, number]>, x: number): boolean {
	return intervals.some(([x0, x1]) => x >= x0 && x <= x1);
}
