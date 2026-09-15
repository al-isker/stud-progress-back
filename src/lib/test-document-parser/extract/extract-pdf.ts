import { DocLine, HighlightSourceKind } from '../types/document-model';
import {
	HighlightShape,
	PdfBox,
	PdfMatrix,
	applyPdfMatrix,
	boxFromTransformedUnitSquare,
	createQuadFillShape,
	decodePdfFillShape,
	decodePdfStrokeShape,
	fillShapeCoversBox,
	highlightSourceIntervalsAtY,
	invertPdfMatrix,
	pointInIntervals,
	splitDisconnectedFillShape
} from './pdf-highlight-geometry';
import { arrangePdfPageGroups, groupPdfItemsByBaseline } from './pdf-layout';
import {
	PdfPageNumberItem,
	PdfPageNumberPage,
	findConfirmedPageNumberItemIds
} from './pdf-page-number-profile';
import { PdfImageObject, PdfJsModule, PdfOptionalContentConfig, PdfPage, loadPdfJs } from './pdfjs';

/** Прямоугольник в координатах страницы (ось Y вверх). */
type Box = PdfBox;

const RASTER_TRANSPARENT = 0;
const RASTER_HIGHLIGHT = 1;
const RASTER_CLEAR = 2;
const RASTER_UNCERTAIN = 3;
const RASTER_HIGHLIGHT_ON_WHITE = 4;
const RASTER_WHITE = 5;
const RASTER_UNCERTAIN_OCCLUSION = 6;

/** Картинка с загрублённой маской визуального эффекта каждого блока. */
interface ImageRegion extends Box {
	gw: number;
	gh: number;
	effects: Uint8Array;
	components: Uint32Array;
	inverseMatrix: PdfMatrix;
	sourceId: string;
	clips: HighlightShape[];
	paintOrder: number;
}

interface ImagePaint {
	id: string | null;
	image: PdfImageObject | null;
	box: Box;
	matrix: PdfMatrix;
	crop: { x: number; y: number; width: number; height: number } | null;
	annotationId: string | null;
	sourceId: string;
	clips: HighlightShape[];
	alpha: number;
	normalBlend: boolean;
	backdropDependent: boolean;
	paintOrder: number;
	uncertain: boolean;
}

type ImageRegionResult =
	| { kind: 'resolved'; region: ImageRegion }
	| { kind: 'transparent' }
	| { kind: 'unreadable' };

type PaintEffect =
	| 'highlight'
	| 'highlight-on-white'
	| 'white'
	| 'clear'
	| 'uncertain'
	| 'uncertain-occlusion';

interface VectorPaintLayer {
	kind: 'vector';
	paintOrder: number;
	effect: PaintEffect;
	shape: HighlightShape;
}

interface BoxPaintLayer {
	kind: 'box';
	paintOrder: number;
	effect: 'uncertain' | 'uncertain-occlusion';
	box: Box;
	clips: HighlightShape[];
}

interface RasterPaintLayer {
	kind: 'raster';
	paintOrder: number;
	region: ImageRegion;
}

interface ImagePaintLayer {
	kind: 'image';
	paintOrder: number;
	paint: ImagePaint;
}

interface GroupComposite {
	alpha: number | null;
	blendMode: 'source-over' | 'normal' | 'multiply' | null;
	uncertain: boolean;
}

interface RawGroupPaintLayer {
	kind: 'group';
	paintOrder: number;
	children: RawPaintLayer[];
	composite: GroupComposite;
	supported: boolean;
}

interface GroupPaintLayer {
	kind: 'group';
	paintOrder: number;
	box: Box;
	children: PaintLayer[];
	composite: GroupComposite;
	supported: boolean;
}

type RawPaintLayer = VectorPaintLayer | BoxPaintLayer | ImagePaintLayer | RawGroupPaintLayer;
type PaintLayer = VectorPaintLayer | BoxPaintLayer | RasterPaintLayer | GroupPaintLayer;

/** Текстовый прогон из контент-стрима: символы + цвет заливки на момент отрисовки. */
interface TextRun {
	chars: string;
	color: string | null;
}

interface StyledItem extends PdfPageNumberItem {
	fontName: string;
	bold: boolean;
	italic: boolean;
	color: string | null;
}

interface PdfTextPageState extends PdfPageNumberPage {
	items: StyledItem[];
}

type Matrix = PdfMatrix;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Аннотации с площадной пометкой ответа; линейные подчёркивания сюда не входят. */
const HIGHLIGHT_ANNOTATIONS = new Set([
	'Highlight',
	'Ink',
	'Square',
	'Circle',
	'Polygon',
	'PolyLine',
	'Stamp'
]);
const NON_RENDERED_ANNOTATION_FLAGS = 1 | 2 | 32;

const BOLD_FONT_RE = /bold|black|heavy|semibold|demibold/i;
const ITALIC_FONT_RE = /italic|oblique/i;

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

/** Цвет, эквивалентный исходному белому фону для порогов этого экстрактора. */
function isWhiteFill(color: string | null): boolean {
	const rgb = parseHexColor(color);

	return rgb !== null && Math.min(...rgb) >= 240;
}

/**
 * «Цветной» пиксель картинки: с заметным оттенком, не чёрный текст и не белый
 * фон. Порог намеренно мягкий — бледные выделения тоже должны попадать в маску;
 * ложные срабатывания шума отсекаются требованием вертикальной сплошности.
 */
function isColoredPixel(
	r: number,
	g: number,
	b: number,
	brightnessFloor: number,
	colorDifferenceFloor = 22
): boolean {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);

	return max - min > colorDifferenceFloor && max > brightnessFloor && min < 250;
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
	paintLayers: RawPaintLayer[];
	runs: TextRun[];
	seenAnnotationIds: Set<string>;
	nextPaintOrder: number;
}

interface GraphicsState {
	ctm: Matrix;
	fillColor: string | null;
	fillColorKnown: boolean;
	fillAlpha: number;
	fillTransparent: boolean;
	strokeColor: string | null;
	strokeColorKnown: boolean;
	strokeAlpha: number;
	strokeTransparent: boolean;
	strokeAlphaUncertain: boolean;
	lineWidth: number;
	lineCap: number;
	lineJoin: number;
	miterLimit: number;
	dashSolid: boolean;
	blendMode: 'source-over' | 'normal' | 'multiply' | null;
	alphaUncertain: boolean;
	blendUncertain: boolean;
	softMaskUncertain: boolean;
	transferUncertain: boolean;
	clipUncertain: boolean;
	clips: HighlightShape[];
}

const cloneGraphicsState = (state: GraphicsState): GraphicsState => ({
	...state,
	ctm: [...state.ctm],
	clips: [...state.clips]
});

function initialGraphicsState(ctm: Matrix = IDENTITY): GraphicsState {
	return {
		ctm: [...ctm],
		fillColor: '#000000',
		fillColorKnown: true,
		fillAlpha: 1,
		fillTransparent: false,
		strokeColor: '#000000',
		strokeColorKnown: true,
		strokeAlpha: 1,
		strokeTransparent: false,
		strokeAlphaUncertain: false,
		lineWidth: 1,
		lineCap: 0,
		lineJoin: 0,
		miterLimit: 10,
		dashSolid: true,
		blendMode: 'source-over',
		alphaUncertain: false,
		blendUncertain: false,
		softMaskUncertain: false,
		transferUncertain: false,
		clipUncertain: false,
		clips: []
	};
}

/** Видимость цветной заливки с учётом поддержанной части graphics state. */
function highlightPaintConfidence(
	state: GraphicsState
): 'none' | 'exact' | 'on-white' | 'uncertain' {
	if (state.fillTransparent || state.fillAlpha <= 0) return 'none';
	if (!state.fillColorKnown || !state.fillColor) return 'uncertain';
	if (!isHighlightFill(state.fillColor)) return 'none';
	if (
		state.alphaUncertain ||
		state.blendUncertain ||
		state.softMaskUncertain ||
		state.transferUncertain ||
		state.clipUncertain
	) {
		return 'uncertain';
	}
	const rgb = parseHexColor(state.fillColor);
	if (!rgb) return 'uncertain';
	const alpha = Math.max(0, Math.min(1, state.fillAlpha));
	// И source-over, и multiply дают эту формулу на исходном белом фоне.
	const onWhite = `#${rgb.map(channel => toHex(channel * alpha + 255 * (1 - alpha))).join('')}`;
	if (!isHighlightFill(onWhite)) return 'none';

	// Непрозрачная normal-заливка не зависит от предыдущего содержимого. Для
	// прозрачной заливки или multiply белый фон должен быть подтверждён во время
	// painter-order sampling; иначе результат остаётся неоднозначным.
	return isExactOpaqueNormalPaint(state) ? 'exact' : 'on-white';
}

/** Видимость цветного stroke с теми же fail-closed правилами, что у fill. */
function highlightStrokePaintConfidence(
	state: GraphicsState
): 'none' | 'exact' | 'on-white' | 'uncertain' {
	if (state.strokeTransparent || state.strokeAlpha <= 0) return 'none';
	if (!state.strokeColorKnown || !state.strokeColor) return 'uncertain';
	if (!isHighlightFill(state.strokeColor)) return 'none';
	if (
		state.strokeAlphaUncertain ||
		state.blendUncertain ||
		state.softMaskUncertain ||
		state.transferUncertain ||
		state.clipUncertain
	) {
		return 'uncertain';
	}
	const rgb = parseHexColor(state.strokeColor);
	if (!rgb) return 'uncertain';
	const alpha = Math.max(0, Math.min(1, state.strokeAlpha));
	const onWhite = `#${rgb.map(channel => toHex(channel * alpha + 255 * (1 - alpha))).join('')}`;
	if (!isHighlightFill(onWhite)) return 'none';

	return isExactOpaqueNormalStrokePaint(state) ? 'exact' : 'on-white';
}

function applyGraphicsStateEntries(state: GraphicsState, args: unknown[]): void {
	const entries = Array.isArray(args?.[0]) ? args[0] : [];
	for (const entry of entries) {
		if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
		const [key, value] = entry;
		if (key === 'ca') {
			if (typeof value === 'number' && Number.isFinite(value)) {
				state.fillAlpha = value;
				state.alphaUncertain = false;
			} else state.alphaUncertain = true;
		} else if (key === 'CA') {
			if (typeof value === 'number' && Number.isFinite(value)) {
				state.strokeAlpha = value;
				state.strokeAlphaUncertain = false;
			} else state.strokeAlphaUncertain = true;
		} else if (key === 'BM') {
			const modes = Array.isArray(value) ? value : [value];
			const supported = modes.find(
				mode => mode === 'source-over' || mode === 'normal' || mode === 'multiply'
			);
			state.blendMode = supported ?? null;
			state.blendUncertain = supported === undefined;
		} else if (key === 'SMask') {
			state.softMaskUncertain = value !== false && value !== 'None';
		} else if (key === 'TR' || key === 'TR2') {
			state.transferUncertain = value !== null && value !== false && value !== 'Identity';
		} else if (key === 'LW') {
			state.lineWidth = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
		} else if (key === 'LC') {
			state.lineCap = typeof value === 'number' ? value : -1;
		} else if (key === 'LJ') {
			state.lineJoin = typeof value === 'number' ? value : -1;
		} else if (key === 'ML') {
			state.miterLimit =
				typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : Number.NaN;
		} else if (key === 'D') {
			const dash = Array.isArray(value) ? value[0] : null;
			state.dashSolid =
				(Array.isArray(dash) || ArrayBuffer.isView(dash)) &&
				(dash as ArrayLike<unknown>).length === 0;
		}
	}
}

function coversWholePage(box: Box, page: Box): boolean {
	const pageWidth = Math.max(0, page.x1 - page.x0);
	const pageHeight = Math.max(0, page.y1 - page.y0);
	if (pageWidth === 0 || pageHeight === 0) return false;
	const overlapWidth = Math.max(0, Math.min(box.x1, page.x1) - Math.max(box.x0, page.x0));
	const overlapHeight = Math.max(0, Math.min(box.y1, page.y1) - Math.max(box.y0, page.y0));

	return overlapWidth / pageWidth >= 0.98 && overlapHeight / pageHeight >= 0.98;
}

function isExactOpaqueNormalPaint(state: GraphicsState): boolean {
	return (
		!state.fillTransparent &&
		state.fillAlpha >= 1 &&
		!state.alphaUncertain &&
		!state.blendUncertain &&
		!state.softMaskUncertain &&
		!state.transferUncertain &&
		!state.clipUncertain &&
		(state.blendMode === 'source-over' || state.blendMode === 'normal')
	);
}

function isExactOpaqueNormalStrokePaint(state: GraphicsState): boolean {
	return (
		!state.strokeTransparent &&
		state.strokeAlpha >= 1 &&
		!state.strokeAlphaUncertain &&
		!state.blendUncertain &&
		!state.softMaskUncertain &&
		!state.transferUncertain &&
		!state.clipUncertain &&
		(state.blendMode === 'source-over' || state.blendMode === 'normal')
	);
}

function hasSimpleGroupCompositing(state: GraphicsState): boolean {
	return (
		state.fillAlpha >= 1 &&
		!state.alphaUncertain &&
		!state.blendUncertain &&
		!state.softMaskUncertain &&
		!state.transferUncertain &&
		(state.blendMode === 'source-over' || state.blendMode === 'normal')
	);
}

function groupCompositeFromState(state: GraphicsState): GroupComposite {
	return {
		alpha:
			typeof state.fillAlpha === 'number' && Number.isFinite(state.fillAlpha)
				? Math.max(0, Math.min(1, state.fillAlpha))
				: null,
		blendMode: state.blendMode,
		uncertain:
			state.alphaUncertain ||
			state.blendUncertain ||
			state.softMaskUncertain ||
			state.transferUncertain
	};
}

/**
 * pdf.js рисует изолированную transparency group во временный прозрачный canvas:
 * цвет/геометрия наследуются, а параметры композиции внутри сбрасываются. Внешние
 * ca/BM применяются позднее один раз к готовой группе.
 */
function resetIsolatedGroupCompositing(state: GraphicsState): void {
	state.fillAlpha = 1;
	state.strokeAlpha = 1;
	state.alphaUncertain = false;
	state.strokeAlphaUncertain = false;
	state.blendMode = 'source-over';
	state.blendUncertain = false;
	state.softMaskUncertain = false;
	state.transferUncertain = false;
}

function paintEffectFromConfidence(
	confidence: 'none' | 'exact' | 'on-white' | 'uncertain',
	exactOpaque: boolean,
	color: string | null,
	wholePageBackground = false
): PaintEffect {
	if (confidence === 'exact' && !wholePageBackground) return 'highlight';
	if (confidence === 'on-white' && !wholePageBackground) return 'highlight-on-white';
	if (confidence === 'none' && exactOpaque) return isWhiteFill(color) ? 'white' : 'clear';
	if (
		confidence === 'none' ||
		((confidence === 'exact' || confidence === 'on-white') && wholePageBackground)
	) {
		return 'uncertain-occlusion';
	}

	return 'uncertain';
}

function activePaintBox(state: GraphicsState, pageBox: Box): Box {
	if (state.clipUncertain || state.clips.length === 0) return pageBox;

	return state.clips.reduce<Box>(
		(box, clip) => ({
			x0: Math.max(box.x0, clip.x0),
			y0: Math.max(box.y0, clip.y0),
			x1: Math.min(box.x1, clip.x1),
			y1: Math.min(box.y1, clip.y1)
		}),
		pageBox
	);
}

function unknownPathEffect(
	state: GraphicsState,
	paintsFill: boolean,
	paintsStroke: boolean
): BoxPaintLayer['effect'] | null {
	const fillVisible = paintsFill && !state.fillTransparent && state.fillAlpha > 0;
	const strokeVisible = paintsStroke && !state.strokeTransparent && state.strokeAlpha > 0;
	if (!fillVisible && !strokeVisible) return null;
	const canBeHighlight =
		(fillVisible && highlightPaintConfidence(state) !== 'none') ||
		(strokeVisible && highlightStrokePaintConfidence(state) !== 'none');

	return canBeHighlight ? 'uncertain' : 'uncertain-occlusion';
}

/** Наибольшее растяжение линейной части affine transform. */
function maximumLinearScale(matrix: Matrix): number | null {
	const [a, b, c, d] = matrix;
	if (![a, b, c, d].every(Number.isFinite)) return null;
	const trace = a * a + b * b + c * c + d * d;
	const determinant = a * d - b * c;
	const discriminant = Math.max(0, trace * trace - 4 * determinant * determinant);
	const scale = Math.sqrt(Math.max(0, (trace + Math.sqrt(discriminant)) / 2));

	return Number.isFinite(scale) ? scale : null;
}

function conservativeStrokeBox(pathBox: Box, state: GraphicsState, pageBox: Box): Box {
	const scale = maximumLinearScale(state.ctm);
	if (!scale || !Number.isFinite(state.lineWidth) || state.lineWidth < 0) {
		return activePaintBox(state, pageBox);
	}
	// PDF miter никогда не выступает дальше miterLimit * half-width. Для
	// неизвестного join/cap берём тот же консервативный предел. Hairline имеет
	// device-зависимую ширину, поэтому получает один page-space пункт запаса.
	const joinFactor =
		state.lineJoin === 0
			? state.miterLimit
			: state.lineJoin === 1 || state.lineJoin === 2
				? 1
				: Math.max(10, state.miterLimit);
	const capFactor =
		state.lineCap === 2 ? Math.SQRT2 : state.lineCap === 0 || state.lineCap === 1 ? 1 : 2;
	if (!Number.isFinite(joinFactor)) return activePaintBox(state, pageBox);
	const expansion =
		state.lineWidth === 0 ? 1 : (state.lineWidth * scale * Math.max(joinFactor, capFactor)) / 2;

	return {
		x0: pathBox.x0 - expansion,
		y0: pathBox.y0 - expansion,
		x1: pathBox.x1 + expansion,
		y1: pathBox.y1 + expansion
	};
}

/** Обход operator list: заливки, картинки и текстовые прогоны с цветом. */
function walkOperatorList(
	fnArray: number[],
	argsArray: unknown[],
	ops: Record<string, number>,
	pageBox: Box,
	pageNumber: number,
	optionalContent: PdfOptionalContentConfig
): PageGraphics {
	const byCode = new Map<number, string>();
	for (const [name, code] of Object.entries(ops)) byCode.set(code, name);
	const fillOps = new Set(
		['fill', 'eoFill', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke']
			.map(n => ops[n])
			.filter(c => c !== undefined)
	);
	const evenOddFillOps = new Set(
		['eoFill', 'eoFillStroke', 'closeEOFillStroke'].map(n => ops[n]).filter(c => c !== undefined)
	);
	const strokeOps = new Set(
		['stroke', 'closeStroke', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke']
			.map(n => ops[n])
			.filter(c => c !== undefined)
	);

	const paintLayers: RawPaintLayer[] = [];
	const runs: TextRun[] = [];
	const seenAnnotationIds = new Set<string>();
	const markedContentVisibility: boolean[] = [];
	const isContentVisible = (): boolean => markedContentVisibility.every(Boolean);
	let pathIndex = 0;
	let clipIndex = 0;
	let paintOrder = 0;
	let pendingClip: { evenOdd: boolean } | null = null;

	let graphics = initialGraphicsState();
	const stack: GraphicsState[] = [];
	const annotationStack: {
		id: string | null;
		graphics: GraphicsState;
		graphicsStackDepth: number;
	}[] = [];
	const groupStack: {
		graphics: GraphicsState;
		graphicsStackDepth: number;
		children: RawPaintLayer[];
		composite: GroupComposite;
		supported: boolean;
		passthrough: boolean;
	}[] = [];
	const currentPaintTarget = (): RawPaintLayer[] => groupStack.at(-1)?.children ?? paintLayers;
	const graphicsStackFloor = (): number =>
		Math.max(
			annotationStack.at(-1)?.graphicsStackDepth ?? 0,
			groupStack.at(-1)?.graphicsStackDepth ?? 0
		);
	const recordUncertainBox = (
		box: Box,
		order = paintOrder++,
		effect: BoxPaintLayer['effect'] = 'uncertain',
		clips: HighlightShape[] = graphics.clips
	): void => {
		if (!isContentVisible()) return;
		currentPaintTarget().push({
			kind: 'box',
			paintOrder: order,
			effect,
			box,
			clips: [...clips]
		});
	};
	const addImagePaint = (
		id: string | null,
		image: PdfImageObject | null,
		matrix: Matrix,
		crop: ImagePaint['crop'] = null
	): void => {
		if (!isContentVisible()) return;
		if (graphics.fillTransparent || graphics.fillAlpha <= 0) return;
		const order = paintOrder++;
		const annotationId = annotationStack.at(-1)?.id ?? null;
		currentPaintTarget().push({
			kind: 'image',
			paintOrder: order,
			paint: {
				id,
				image,
				crop,
				annotationId,
				sourceId: annotationId
					? `${pageNumber}:annotation:${annotationId}`
					: `${pageNumber}:image:${order}`,
				matrix,
				box: boxFromTransformedUnitSquare(matrix),
				clips: [...graphics.clips],
				alpha: Math.max(0, Math.min(1, graphics.fillAlpha)),
				normalBlend: graphics.blendMode === 'source-over' || graphics.blendMode === 'normal',
				backdropDependent:
					graphics.fillAlpha < 1 ||
					!(graphics.blendMode === 'source-over' || graphics.blendMode === 'normal'),
				paintOrder: order,
				uncertain:
					graphics.alphaUncertain ||
					graphics.blendUncertain ||
					graphics.softMaskUncertain ||
					graphics.transferUncertain ||
					graphics.clipUncertain
			}
		});
	};

	for (let i = 0; i < fnArray.length; i++) {
		const name = byCode.get(fnArray[i]);
		const args = argsArray[i] as unknown[];

		switch (name) {
			case 'beginMarkedContent':
				markedContentVisibility.push(true);
				break;
			case 'beginMarkedContentProps': {
				const [tag, properties] = args ?? [];
				let visible = true;
				if (tag === 'OC') {
					try {
						visible = optionalContent.isVisible(properties) === true;
					} catch {
						// Неизвестную optional-content область безопаснее не считать
						// видимым маркером: вопрос останется без доказанного ответа.
						visible = false;
					}
				}
				markedContentVisibility.push(visible);
				break;
			}
			case 'endMarkedContent':
				markedContentVisibility.pop();
				break;
			case 'save':
				stack.push(cloneGraphicsState(graphics));
				break;
			case 'restore': {
				const stackFloor = graphicsStackFloor();
				const s = stack.length > stackFloor ? stack.pop() : undefined;
				if (s) graphics = s;
				pendingClip = null;
				break;
			}
			case 'transform':
				if (Array.isArray(args) && args.length >= 6) {
					graphics.ctm = matMul(graphics.ctm, args as Matrix);
				}
				break;
			case 'paintFormXObjectBegin':
				stack.push(cloneGraphicsState(graphics));
				if (Array.isArray(args) && Array.isArray(args[0])) {
					graphics.ctm = matMul(graphics.ctm, args[0] as Matrix);
				}
				if (Array.isArray(args?.[1]) && args[1].length === 4) {
					const [x0, y0, x1, y1] = args[1] as number[];
					const clip = decodePdfFillShape(
						[0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4],
						graphics.ctm,
						false,
						`${pageNumber}:clip:${clipIndex++}`
					);
					if (clip) graphics.clips.push(clip);
					else graphics.clipUncertain = true;
				}
				break;
			case 'paintFormXObjectEnd': {
				const stackFloor = graphicsStackFloor();
				const s = stack.length > stackFloor ? stack.pop() : undefined;
				if (s) graphics = s;
				pendingClip = null;
				break;
			}
			case 'beginGroup': {
				const parentGraphics = cloneGraphicsState(graphics);
				const composite = groupCompositeFromState(parentGraphics);
				const group = args?.[0] as
					| {
							bbox?: ArrayLike<number> | null;
							matrix?: ArrayLike<number> | null;
							smask?: unknown;
							hasSoftMask?: unknown;
							needsIsolation?: unknown;
							isolated?: unknown;
							knockout?: unknown;
							isGray?: unknown;
					  }
					| undefined;
				const passthrough =
					!!group &&
					hasSimpleGroupCompositing(parentGraphics) &&
					(group.needsIsolation === false ||
						(group.isolated === false && group.hasSoftMask !== true)) &&
					group.knockout !== true &&
					group.isGray !== true;
				const supported =
					!!group &&
					group.isolated === true &&
					!group.smask &&
					group.hasSoftMask !== true &&
					group.knockout !== true &&
					group.isGray !== true &&
					composite.alpha !== null &&
					!composite.uncertain &&
					(composite.blendMode === 'source-over' ||
						composite.blendMode === 'normal' ||
						composite.blendMode === 'multiply');
				groupStack.push({
					graphics: parentGraphics,
					graphicsStackDepth: stack.length,
					children: [],
					composite,
					supported,
					passthrough
				});
				const bbox = group?.bbox;
				if (bbox && bbox.length === 4 && Array.from(bbox).every(Number.isFinite)) {
					const matrix = group?.matrix;
					const matrixValues = matrix ? Array.from(matrix).slice(0, 6) : null;
					if (
						matrix &&
						(matrix.length < 6 || !matrixValues || !matrixValues.every(Number.isFinite))
					) {
						graphics.clipUncertain = true;
					} else {
						const clipMatrix = matrixValues
							? matMul(graphics.ctm, matrixValues as Matrix)
							: graphics.ctm;
						const [x0, y0, x1, y1] = Array.from(bbox);
						const clip = decodePdfFillShape(
							[0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4],
							clipMatrix,
							false,
							`${pageNumber}:clip:${clipIndex++}`
						);
						if (clip) graphics.clips.push(clip);
						else graphics.clipUncertain = true;
					}
				} else if (bbox) {
					graphics.clipUncertain = true;
				}
				if (!passthrough) resetIsolatedGroupCompositing(graphics);
				pendingClip = null;
				break;
			}
			case 'endGroup': {
				const group = groupStack.pop();
				if (group) {
					stack.length = group.graphicsStackDepth;
					graphics = group.graphics;
					if (group.passthrough) {
						currentPaintTarget().push(...group.children);
					} else if (group.children.length > 0) {
						currentPaintTarget().push({
							kind: 'group',
							paintOrder: paintOrder++,
							children: group.children,
							composite: group.composite,
							supported: group.supported
						});
					}
				}
				pendingClip = null;
				break;
			}
			case 'beginAnnotation': {
				if (typeof args?.[0] === 'string') seenAnnotationIds.add(args[0]);
				annotationStack.push({
					id: typeof args?.[0] === 'string' ? args[0] : null,
					graphics: cloneGraphicsState(graphics),
					graphicsStackDepth: stack.length
				});
				// pdf.js рисует appearance stream аннотации в отдельном начальном
				// graphics state и последовательно применяет transform и matrix.
				graphics = initialGraphicsState();
				if (Array.isArray(args?.[2]) && args[2].length >= 6) {
					graphics.ctm = matMul(graphics.ctm, args[2] as Matrix);
				}
				if (Array.isArray(args?.[3]) && args[3].length >= 6) {
					graphics.ctm = matMul(graphics.ctm, args[3] as Matrix);
				}
				if (Array.isArray(args?.[1]) && args[1].length === 4) {
					const [x0, y0, x1, y1] = args[1] as number[];
					const clip = createQuadFillShape(
						[x0, y1, x1, y1, x0, y0, x1, y0],
						`${pageNumber}:clip:${clipIndex++}`
					);
					if (clip) graphics.clips.push(clip);
					else graphics.clipUncertain = true;
				}
				pendingClip = null;
				break;
			}
			case 'endAnnotation': {
				const annotation = annotationStack.pop();
				if (annotation) {
					stack.length = annotation.graphicsStackDepth;
					graphics = annotation.graphics;
				}
				pendingClip = null;
				break;
			}
			case 'setGState':
				applyGraphicsStateEntries(graphics, args);
				break;
			case 'clip':
				pendingClip = { evenOdd: false };
				break;
			case 'eoClip':
				pendingClip = { evenOdd: true };
				break;
			case 'setFillTransparent':
				graphics.fillTransparent = true;
				break;
			case 'setStrokeTransparent':
				graphics.strokeTransparent = true;
				break;
			case 'setFillColor':
			case 'setFillRGBColor':
			case 'setFillGray':
			case 'setFillCMYKColor': {
				const color = normalizeColorArg(args);
				graphics.fillColor = color;
				graphics.fillColorKnown = color !== null;
				graphics.fillTransparent = false;
				break;
			}
			case 'setFillColorN': {
				const color = normalizeColorArg(args);
				graphics.fillColor = color;
				graphics.fillColorKnown = color !== null;
				graphics.fillTransparent = false;
				break;
			}
			case 'setStrokeColor':
			case 'setStrokeRGBColor':
			case 'setStrokeGray':
			case 'setStrokeCMYKColor':
			case 'setStrokeColorN': {
				const color = normalizeColorArg(args);
				graphics.strokeColor = color;
				graphics.strokeColorKnown = color !== null;
				graphics.strokeTransparent = false;
				break;
			}
			case 'setLineWidth':
				if (typeof args?.[0] === 'number' && Number.isFinite(args[0])) {
					graphics.lineWidth = args[0];
				} else graphics.lineWidth = Number.NaN;
				break;
			case 'setLineCap':
				graphics.lineCap = typeof args?.[0] === 'number' ? args[0] : -1;
				break;
			case 'setLineJoin':
				graphics.lineJoin = typeof args?.[0] === 'number' ? args[0] : -1;
				break;
			case 'setMiterLimit':
				graphics.miterLimit =
					typeof args?.[0] === 'number' && Number.isFinite(args[0]) && args[0] >= 1
						? args[0]
						: Number.NaN;
				break;
			case 'setDash': {
				const pattern = args?.[0];
				graphics.dashSolid =
					(Array.isArray(pattern) || ArrayBuffer.isView(pattern)) &&
					(pattern as ArrayLike<unknown>).length === 0;
				break;
			}
			case 'constructPath': {
				if (!Array.isArray(args) || args.length < 3) {
					if (pendingClip) graphics.clipUncertain = true;
					pendingClip = null;
					break;
				}
				const paintOp = args[0];
				const paintsFill = typeof paintOp === 'number' && fillOps.has(paintOp);
				const paintsStroke = typeof paintOp === 'number' && strokeOps.has(paintOp);
				const annotationId = annotationStack.at(-1)?.id ?? null;
				const clipRequest = pendingClip;
				pendingClip = null;
				if (!paintsFill && !paintsStroke && !clipRequest) break;
				const rawPath = args[1] as unknown;
				let pathData: ArrayLike<number> | null = null;
				let explicitlyEmptyPath = false;
				if (ArrayBuffer.isView(rawPath)) {
					pathData = rawPath as unknown as ArrayLike<number>;
					explicitlyEmptyPath = pathData.length === 0;
				} else if (Array.isArray(rawPath)) {
					if (rawPath.length === 0 || (rawPath.length === 1 && rawPath[0] == null)) {
						explicitlyEmptyPath = true;
					} else if (rawPath.every(value => typeof value === 'number')) {
						pathData = rawPath as number[];
					} else {
						const first = rawPath[0];
						if (Array.isArray(first) || ArrayBuffer.isView(first)) {
							pathData = first as unknown as ArrayLike<number>;
							explicitlyEmptyPath = pathData.length === 0;
						}
					}
				}
				if (explicitlyEmptyPath) {
					if (clipRequest) graphics.clipUncertain = true;
					break;
				}
				const paintClips = [...graphics.clips];
				const paintClipUncertain = graphics.clipUncertain;
				const minMax = args[2] as ArrayLike<number> | undefined;
				if (!minMax || minMax.length !== 4 || !Array.from(minMax).every(Number.isFinite)) {
					if (clipRequest) graphics.clipUncertain = true;
					const effect = unknownPathEffect(graphics, paintsFill, paintsStroke);
					if (effect) {
						recordUncertainBox(activePaintBox(graphics, pageBox), paintOrder++, effect, paintClips);
					}
					break;
				}
				const corners = [
					applyPdfMatrix(graphics.ctm, minMax[0], minMax[1]),
					applyPdfMatrix(graphics.ctm, minMax[0], minMax[3]),
					applyPdfMatrix(graphics.ctm, minMax[2], minMax[1]),
					applyPdfMatrix(graphics.ctm, minMax[2], minMax[3])
				];
				const box: Box = {
					x0: Math.min(...corners.map(point => point.x)),
					y0: Math.min(...corners.map(point => point.y)),
					x1: Math.max(...corners.map(point => point.x)),
					y1: Math.max(...corners.map(point => point.y))
				};
				if (clipRequest) {
					const clip = pathData
						? decodePdfFillShape(
								pathData,
								graphics.ctm,
								clipRequest.evenOdd,
								`${pageNumber}:clip:${clipIndex++}`
							)
						: null;
					if (clip) graphics.clips.push(clip);
					else graphics.clipUncertain = true;
				}
				const paintGraphics = {
					...graphics,
					clipUncertain: paintClipUncertain
				};
				const pathId = pathIndex++;
				if (
					isContentVisible() &&
					paintsFill &&
					!graphics.fillTransparent &&
					graphics.fillAlpha > 0
				) {
					const order = paintOrder++;
					const confidence = highlightPaintConfidence(paintGraphics);
					const sourceId = annotationId
						? `${pageNumber}:annotation:${annotationId}:fill`
						: `${pageNumber}:path:${pathId}:fill`;
					const shape = pathData
						? decodePdfFillShape(pathData, graphics.ctm, evenOddFillOps.has(paintOp), sourceId)
						: null;
					if (!shape) {
						recordUncertainBox(
							box,
							order,
							confidence === 'none' ? 'uncertain-occlusion' : 'uncertain',
							paintClips
						);
					} else {
						shape.clips = paintClips;
						const paintShapes =
							confidence === 'exact' || confidence === 'on-white'
								? splitDisconnectedFillShape(shape)
								: [shape];
						for (const paintShape of paintShapes) {
							const effect = paintEffectFromConfidence(
								confidence,
								isExactOpaqueNormalPaint(paintGraphics),
								paintGraphics.fillColor,
								fillShapeCoversBox(paintShape, pageBox)
							);
							currentPaintTarget().push({
								kind: 'vector',
								paintOrder: order,
								effect,
								shape: paintShape
							});
						}
					}
				}

				if (
					isContentVisible() &&
					paintsStroke &&
					!graphics.strokeTransparent &&
					graphics.strokeAlpha > 0
				) {
					const order = paintOrder++;
					const sourceId = annotationId
						? `${pageNumber}:annotation:${annotationId}:stroke`
						: `${pageNumber}:path:${pathId}:stroke`;
					const shape =
						pathData && paintGraphics.dashSolid
							? decodePdfStrokeShape(
									pathData,
									graphics.ctm,
									paintGraphics.lineWidth,
									paintGraphics.lineCap,
									paintGraphics.lineJoin,
									sourceId
								)
							: null;
					const confidence = highlightStrokePaintConfidence(paintGraphics);
					if (!shape) {
						recordUncertainBox(
							conservativeStrokeBox(box, paintGraphics, pageBox),
							order,
							confidence === 'none' ? 'uncertain-occlusion' : 'uncertain',
							paintClips
						);
					} else {
						shape.clips = paintClips;
						const effect = paintEffectFromConfidence(
							confidence,
							isExactOpaqueNormalStrokePaint(paintGraphics),
							paintGraphics.strokeColor
						);
						currentPaintTarget().push({ kind: 'vector', paintOrder: order, effect, shape });
					}
				}
				break;
			}
			case 'paintImageXObject': {
				if (!Array.isArray(args) || typeof args[0] !== 'string') break;
				addImagePaint(args[0], null, graphics.ctm);
				break;
			}
			case 'paintInlineImageXObject': {
				const image = args?.[0];
				if (!image || typeof image !== 'object') break;
				addImagePaint(null, image as PdfImageObject, graphics.ctm);
				break;
			}
			case 'paintImageXObjectRepeat': {
				const [id, scaleX, scaleY, positions] = args ?? [];
				if (
					typeof id !== 'string' ||
					typeof scaleX !== 'number' ||
					typeof scaleY !== 'number' ||
					!positions ||
					typeof (positions as ArrayLike<number>).length !== 'number'
				) {
					break;
				}
				for (let offset = 0; offset + 1 < (positions as ArrayLike<number>).length; offset += 2) {
					addImagePaint(
						id,
						null,
						matMul(graphics.ctm, [
							scaleX,
							0,
							0,
							scaleY,
							(positions as ArrayLike<number>)[offset],
							(positions as ArrayLike<number>)[offset + 1]
						])
					);
				}
				break;
			}
			case 'paintInlineImageXObjectGroup': {
				const image = args?.[0];
				const map = args?.[1];
				if (!image || typeof image !== 'object' || !Array.isArray(map)) break;
				for (const entry of map) {
					if (!entry || typeof entry !== 'object') continue;
					const candidate = entry as {
						transform?: unknown;
						x?: unknown;
						y?: unknown;
						w?: unknown;
						h?: unknown;
					};
					if (!Array.isArray(candidate.transform) || candidate.transform.length < 6) {
						recordUncertainBox(activePaintBox(graphics, pageBox));
						continue;
					}
					const matrix = matMul(graphics.ctm, candidate.transform as Matrix);
					if (
						![candidate.x, candidate.y, candidate.w, candidate.h].every(
							value => typeof value === 'number' && Number.isFinite(value)
						)
					) {
						recordUncertainBox(boxFromTransformedUnitSquare(matrix));
						continue;
					}
					addImagePaint(null, image as PdfImageObject, matrix, {
						x: candidate.x as number,
						y: candidate.y as number,
						width: candidate.w as number,
						height: candidate.h as number
					});
				}
				break;
			}
			case 'paintImageMaskXObject':
			case 'paintSolidColorImageMask': {
				if (!graphics.fillTransparent && graphics.fillAlpha > 0) {
					recordUncertainBox(boxFromTransformedUnitSquare(graphics.ctm));
				}
				break;
			}
			case 'paintImageMaskXObjectRepeat': {
				if (graphics.fillTransparent || graphics.fillAlpha <= 0) break;
				const [, scaleX, skewX, skewY, scaleY, positions] = args ?? [];
				if (
					![scaleX, skewX, skewY, scaleY].every(value => typeof value === 'number') ||
					!positions ||
					typeof (positions as ArrayLike<number>).length !== 'number'
				) {
					recordUncertainBox(boxFromTransformedUnitSquare(graphics.ctm));
					break;
				}
				for (let offset = 0; offset + 1 < (positions as ArrayLike<number>).length; offset += 2) {
					const matrix = matMul(graphics.ctm, [
						scaleX as number,
						skewX as number,
						skewY as number,
						scaleY as number,
						(positions as ArrayLike<number>)[offset],
						(positions as ArrayLike<number>)[offset + 1]
					]);
					recordUncertainBox(boxFromTransformedUnitSquare(matrix));
				}
				break;
			}
			case 'paintImageMaskXObjectGroup': {
				if (graphics.fillTransparent || graphics.fillAlpha <= 0) break;
				const images = args?.[0];
				if (!Array.isArray(images)) {
					recordUncertainBox(boxFromTransformedUnitSquare(graphics.ctm));
					break;
				}
				for (const image of images) {
					if (!image || typeof image !== 'object') continue;
					const candidate = image as {
						transform?: unknown;
						width?: unknown;
						height?: unknown;
					};
					if (
						!Array.isArray(candidate.transform) ||
						candidate.transform.length < 6 ||
						typeof candidate.width !== 'number' ||
						typeof candidate.height !== 'number'
					) {
						recordUncertainBox(boxFromTransformedUnitSquare(graphics.ctm));
						continue;
					}
					const transformed = matMul(matMul(graphics.ctm, candidate.transform as Matrix), [
						candidate.width,
						0,
						0,
						candidate.height,
						0,
						0
					]);
					recordUncertainBox(boxFromTransformedUnitSquare(transformed));
				}
				break;
			}
			case 'shadingFill':
				// Цвет и локальная геометрия shading pattern недоступны через этот
				// operator list. Он остаётся упорядоченной неопределённостью в clip.
				if (!graphics.fillTransparent && graphics.fillAlpha > 0) {
					recordUncertainBox(activePaintBox(graphics, pageBox));
				}
				break;
			case 'rawFillPath':
				// pdf.js генерирует этот op только для контуров Type3-глифов. Текст
				// не является фоновой пометкой и намеренно не перекрывает маркер.
				break;
			case 'showText': {
				// Текст appearance stream отсутствует в getTextContent и нарушит
				// позиционное сопоставление текстовых прогонов с элементами страницы.
				if (annotationStack.length > 0) break;
				if (!Array.isArray(args) || !Array.isArray(args[0])) break;
				let chars = '';
				for (const g of args[0] as unknown[]) {
					if (g && typeof g === 'object') chars += (g as { unicode?: string }).unicode ?? '';
				}
				if (chars) {
					runs.push({
						chars,
						color: graphics.fillColorKnown ? graphics.fillColor : null
					});
				}
				break;
			}
		}
	}

	return {
		paintLayers,
		runs,
		seenAnnotationIds,
		nextPaintOrder: paintOrder
	};
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

/** Нумерует несвязанные цветные области картинки без объединения по диагонали. */
function labelImageComponents(grid: Uint8Array, width: number, height: number): Uint32Array {
	const components = new Uint32Array(grid.length);
	let nextComponent = 0;
	for (let start = 0; start < grid.length; start++) {
		if (grid[start] === 0 || components[start] !== 0) continue;
		nextComponent++;
		components[start] = nextComponent;
		const queue = [start];
		for (let cursor = 0; cursor < queue.length; cursor++) {
			const current = queue[cursor];
			const x = current % width;
			const y = Math.floor(current / width);
			const neighbors = [
				x > 0 ? current - 1 : -1,
				x + 1 < width ? current + 1 : -1,
				y > 0 ? current - width : -1,
				y + 1 < height ? current + width : -1
			];
			for (const neighbor of neighbors) {
				if (neighbor < 0 || grid[neighbor] === 0 || components[neighbor] !== 0) continue;
				components[neighbor] = nextComponent;
				queue.push(neighbor);
			}
		}
	}

	return components;
}

/**
 * Строит загрублённую маску цветных областей картинки. Ячейка считается
 * выделенной по ДОЛЕ цветных пикселей в своём блоке, а не по одному пикселю, —
 * так переживают даунсемплинг бледные и «зернистые» (полупрозрачные) выделения,
 * а редкий шум сжатия не набирает нужной плотности.
 */
function buildImageRegion(
	image: PdfImageObject,
	paint: ImagePaint,
	brightnessFloor: number,
	colorDifferenceFloor: number,
	wholePage: boolean
): ImageRegionResult {
	const { width, height, data } = image;
	if (!width || !height || !data) return { kind: 'unreadable' };
	const inverseMatrix = invertPdfMatrix(paint.matrix);
	if (!inverseMatrix) return { kind: 'unreadable' };
	const channels = Math.round(data.length / (width * height));
	if (channels !== 3 && channels !== 4) return { kind: 'unreadable' };
	const crop = paint.crop ?? { x: 0, y: 0, width, height };
	if (
		crop.width <= 0 ||
		crop.height <= 0 ||
		crop.x < 0 ||
		crop.y < 0 ||
		crop.x + crop.width > width ||
		crop.y + crop.height > height
	) {
		return { kind: 'unreadable' };
	}
	const sourceX0 = Math.floor(crop.x);
	const sourceY0 = Math.floor(crop.y);
	const sourceX1 = Math.ceil(crop.x + crop.width);
	const sourceY1 = Math.ceil(crop.y + crop.height);
	const sourceWidth = sourceX1 - sourceX0;
	const sourceHeight = sourceY1 - sourceY0;

	const gw = Math.min(sourceWidth, 480);
	const gh = Math.min(sourceHeight, 3200);
	const sampled = new Uint32Array(gw * gh);
	const visible = new Uint32Array(gw * gh);
	const backdropDependent = new Uint32Array(gw * gh);
	const colored = new Uint32Array(gw * gh);
	const opaque = new Uint32Array(gw * gh);
	const opaqueClear = new Uint32Array(gw * gh);
	const opaqueWhite = new Uint32Array(gw * gh);
	for (let sourceY = sourceY0; sourceY < sourceY1; sourceY++) {
		const sy = sourceY - sourceY0;
		const gy = Math.min(gh - 1, Math.floor((sy * gh) / sourceHeight));
		const rowCell = gy * gw;
		const rowPix = sourceY * width;
		for (let sourceX = sourceX0; sourceX < sourceX1; sourceX++) {
			const sx = sourceX - sourceX0;
			const o = (rowPix + sourceX) * channels;
			// Отбрасываем только альфу, которая даже в предельном случае не меняет
			// 8-битный канал больше чем на один уровень. Видимую слабую альфу нельзя
			// терять заранее: её цвет оценивается уже после композиции на белом.
			const intrinsicAlpha = channels === 4 ? data[o + 3] / 255 : 1;
			const alpha = intrinsicAlpha * paint.alpha;
			const cell = rowCell + Math.min(gw - 1, Math.floor((sx * gw) / sourceWidth));
			sampled[cell]++;
			if (alpha <= 1 / 255) continue;
			visible[cell]++;
			if (paint.backdropDependent || alpha < 1) backdropDependent[cell]++;
			if (paint.normalBlend && alpha >= 1) opaque[cell]++;
			const red = data[o] * alpha + 255 * (1 - alpha);
			const green = data[o + 1] * alpha + 255 * (1 - alpha);
			const blue = data[o + 2] * alpha + 255 * (1 - alpha);
			if (isColoredPixel(red, green, blue, brightnessFloor, colorDifferenceFloor)) {
				colored[cell]++;
			} else if (paint.normalBlend && alpha >= 1) {
				opaqueClear[cell]++;
				if (Math.min(red, green, blue) >= 240) opaqueWhite[cell]++;
			}
		}
	}

	const effects = new Uint8Array(gw * gh);
	const highlights = new Uint8Array(gw * gh);
	let hasPaint = false;
	let highlightCells = 0;
	for (let i = 0; i < effects.length; i++) {
		if (visible[i] === 0) continue;
		hasPaint = true;
		if (colored[i] / visible[i] >= 0.1) {
			effects[i] = backdropDependent[i] > 0 ? RASTER_HIGHLIGHT_ON_WHITE : RASTER_HIGHLIGHT;
			highlights[i] = 1;
			highlightCells++;
		} else if (colored[i] > 0) {
			// Цветовой сигнал есть, но его плотности недостаточно, чтобы назвать
			// весь блок маркером. Это неоднозначность выбора ответа, а не просто
			// возможное перекрытие уже найденного нижнего слоя.
			effects[i] = RASTER_UNCERTAIN;
		} else if (opaqueClear[i] === sampled[i]) {
			effects[i] = opaqueWhite[i] === sampled[i] ? RASTER_WHITE : RASTER_CLEAR;
		} else {
			// Ахроматичный или частично прозрачный слой сам не является кандидатом
			// на marker, но может скрывать цвет нижнего paint.
			effects[i] = RASTER_UNCERTAIN_OCCLUSION;
		}
	}
	// Однородная картинка, закрывающая практически всю страницу, является
	// фоном, а не селектором ответа. Разреженный page-sized appearance (как
	// Stamp с отдельными полосами) этим правилом не затрагивается.
	if (wholePage && highlightCells / effects.length >= 0.98) {
		for (let i = 0; i < effects.length; i++) {
			if (effects[i] !== RASTER_HIGHLIGHT && effects[i] !== RASTER_HIGHLIGHT_ON_WHITE) {
				continue;
			}
			effects[i] = opaque[i] === sampled[i] ? RASTER_CLEAR : RASTER_UNCERTAIN_OCCLUSION;
			highlights[i] = 0;
		}
	}

	return hasPaint
		? {
				kind: 'resolved',
				region: {
					...paint.box,
					gw,
					gh,
					effects,
					components: labelImageComponents(highlights, gw, gh),
					inverseMatrix,
					sourceId: paint.sourceId,
					clips: paint.clips,
					paintOrder: paint.paintOrder
				}
			}
		: { kind: 'transparent' };
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

async function extractPageTextState(page: PdfPage, pageNumber: number): Promise<PdfTextPageState> {
	const view = page.view;
	const pageLeft = Math.min(view[0], view[2]);
	const pageBottom = Math.min(view[1], view[3]);
	const textContent = await page.getTextContent();
	const unresolved = textContent.items.flatMap((item, index) =>
		typeof item.str === 'string' && item.transform
			? [
					{
						id: `${pageNumber}:${index}`,
						str: item.str,
						x: item.transform[4],
						y: item.transform[5],
						w: item.width ?? 0,
						size: Math.hypot(item.transform[0], item.transform[1]),
						fontName: item.fontName ?? '',
						fontFamily: textContent.styles?.[item.fontName ?? '']?.fontFamily ?? item.fontName ?? ''
					}
				]
			: []
	);

	return {
		page: pageNumber,
		pageLeft,
		pageBottom,
		pageWidth: Math.abs(view[2] - view[0]),
		pageHeight: Math.abs(view[3] - view[1]),
		items: unresolved.map(item => ({
			id: item.id,
			str: item.str,
			x: item.x,
			y: item.y,
			w: item.w,
			size: item.size,
			fontName: item.fontName,
			fontFamily: item.fontFamily,
			bold: false,
			italic: false,
			color: null
		}))
	};
}

function assignFontFlags(page: PdfPage, items: StyledItem[]): void {
	const fontFlags = new Map<string, { bold: boolean; italic: boolean }>();
	for (const name of new Set(items.map(item => item.fontName))) {
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

	for (const item of items) {
		const flags = fontFlags.get(item.fontName);
		item.bold = flags?.bold ?? false;
		item.italic = flags?.italic ?? false;
	}
}

function clipIntervalsAtY(
	clips: HighlightShape[],
	y: number,
	x0: number,
	x1: number
): Array<Array<[number, number]>> {
	return clips.map(clip =>
		highlightSourceIntervalsAtY([clip], y, x0, x1).flatMap(source => source.intervals)
	);
}

function pointInPreparedClips(clips: Array<Array<[number, number]>>, x: number): boolean {
	return clips.every(intervals => pointInIntervals(intervals, x));
}

interface PointPaint {
	effect: PaintEffect;
	sourceIds: Set<string>;
}

type PreparedPaintLayer =
	| { kind: 'vector'; layer: VectorPaintLayer; intervals: Array<[number, number]> }
	| {
			kind: 'box';
			layer: BoxPaintLayer;
			clipIntervals: Array<Array<[number, number]>>;
	  }
	| {
			kind: 'raster';
			layer: RasterPaintLayer;
			clipIntervals: Array<Array<[number, number]>>;
	  }
	| { kind: 'group'; layer: GroupPaintLayer; children: PreparedPaintLayer[] };

const noPaintSources = (): Set<string> => new Set<string>();

/** Итоговый эффект raster-paint в точке страницы. */
function imagePaintAt(region: ImageRegion, x: number, y: number): PointPaint | null {
	if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) return null;
	const point = applyPdfMatrix(region.inverseMatrix, x, y);
	if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
	const gx = Math.min(region.gw - 1, Math.max(0, Math.floor(point.x * region.gw)));
	const gy = Math.min(region.gh - 1, Math.max(0, Math.floor((1 - point.y) * region.gh)));
	const effect = region.effects[gy * region.gw + gx];
	if (effect === RASTER_TRANSPARENT) return null;
	if (effect === RASTER_WHITE) return { effect: 'white', sourceIds: noPaintSources() };
	if (effect === RASTER_CLEAR) return { effect: 'clear', sourceIds: noPaintSources() };
	if (effect === RASTER_UNCERTAIN) {
		return { effect: 'uncertain', sourceIds: noPaintSources() };
	}
	if (effect === RASTER_UNCERTAIN_OCCLUSION) {
		return { effect: 'uncertain-occlusion', sourceIds: noPaintSources() };
	}
	const component = region.components[gy * region.gw + gx];

	return component > 0
		? {
				effect: effect === RASTER_HIGHLIGHT_ON_WHITE ? 'highlight-on-white' : 'highlight',
				sourceIds: new Set([`${region.sourceId}:${component}`])
			}
		: { effect: 'uncertain', sourceIds: noPaintSources() };
}

function preparePaintLayer(
	layer: PaintLayer,
	y: number,
	x0: number,
	x1: number
): PreparedPaintLayer | null {
	const box = paintLayerBox(layer);
	if (y < box.y0 || y > box.y1 || x1 < box.x0 || x0 > box.x1) return null;
	if (layer.kind === 'vector') {
		const intervals = highlightSourceIntervalsAtY([layer.shape], y, x0, x1).flatMap(
			source => source.intervals
		);

		return intervals.length > 0 ? { kind: 'vector', layer, intervals } : null;
	}
	if (layer.kind === 'box') {
		return {
			kind: 'box',
			layer,
			clipIntervals: clipIntervalsAtY(layer.clips, y, x0, x1)
		};
	}
	if (layer.kind === 'raster') {
		return {
			kind: 'raster',
			layer,
			clipIntervals: clipIntervalsAtY(layer.region.clips, y, x0, x1)
		};
	}
	const children = layer.children
		.map(child => preparePaintLayer(child, y, x0, x1))
		.filter((child): child is PreparedPaintLayer => child !== null)
		.sort((left, right) => right.layer.paintOrder - left.layer.paintOrder);

	return children.length > 0 ? { kind: 'group', layer, children } : null;
}

function resolvePaintStack(hits: PointPaint[], base: 'transparent' | 'white'): PointPaint | null {
	let hasUncertainOcclusion = false;
	let dependentHighlightSources: Set<string> | null = null;
	for (const hit of hits) {
		if (hit.effect === 'uncertain-occlusion') {
			if (dependentHighlightSources) {
				return { effect: 'uncertain', sourceIds: noPaintSources() };
			}
			hasUncertainOcclusion = true;
			continue;
		}
		if (hit.effect === 'highlight-on-white' && hit.sourceIds.size > 0) {
			// Категория хранит только доказательство результата на белом фоне, но не
			// исходные RGB/alpha. Поэтому второй зависимый цветной слой уже нельзя
			// скомпозитить гарантированно: два допустимых маркера способны вместе дать
			// почти чёрный цвет. Такое пересечение остаётся fail-closed ambiguity.
			if (hasUncertainOcclusion || dependentHighlightSources) {
				return { effect: 'uncertain', sourceIds: noPaintSources() };
			}
			dependentHighlightSources = new Set(hit.sourceIds);
			continue;
		}
		if (hit.effect === 'uncertain') {
			return { effect: 'uncertain', sourceIds: noPaintSources() };
		}
		if (dependentHighlightSources) {
			if (hit.effect === 'white') {
				return { effect: 'highlight', sourceIds: dependentHighlightSources };
			}

			// Даже подтверждённый нижний highlight не является доказанным белым
			// backdrop. Без точного цветового композита итог может перестать быть
			// маркером, поэтому его нельзя молча принимать.
			return { effect: 'uncertain', sourceIds: noPaintSources() };
		}
		if (hit.effect === 'highlight') {
			return hasUncertainOcclusion ? { effect: 'uncertain', sourceIds: noPaintSources() } : hit;
		}
		// white/clear — непрозрачный normal paint, поэтому нижние слои уже не влияют.
		return hit;
	}
	if (dependentHighlightSources) {
		return {
			effect: base === 'white' ? 'highlight' : 'highlight-on-white',
			sourceIds: dependentHighlightSources
		};
	}

	return hasUncertainOcclusion
		? { effect: 'uncertain-occlusion', sourceIds: noPaintSources() }
		: null;
}

function applyGroupComposite(group: GroupPaintLayer, source: PointPaint | null): PointPaint | null {
	if (!source) return null;
	const { alpha, blendMode, uncertain } = group.composite;
	if (alpha === 0) return null;
	if (!group.supported || uncertain || alpha === null || blendMode === null) {
		return { effect: 'uncertain', sourceIds: noPaintSources() };
	}
	if (source.effect === 'uncertain' || source.effect === 'uncertain-occlusion') return source;
	if (alpha < 1) {
		if (blendMode === 'multiply' && source.effect === 'white') return null;

		return source.effect === 'highlight' || source.effect === 'highlight-on-white'
			? { effect: 'uncertain', sourceIds: noPaintSources() }
			: { effect: 'uncertain-occlusion', sourceIds: noPaintSources() };
	}
	if (blendMode === 'source-over' || blendMode === 'normal') return source;
	if (source.effect === 'white') return null;
	if (source.effect === 'clear') {
		return { effect: 'uncertain-occlusion', sourceIds: noPaintSources() };
	}

	return { effect: 'highlight-on-white', sourceIds: source.sourceIds };
}

function preparedPaintAt(candidate: PreparedPaintLayer, x: number, y: number): PointPaint | null {
	if (candidate.kind === 'vector') {
		if (!pointInIntervals(candidate.intervals, x)) return null;

		return {
			effect: candidate.layer.effect,
			sourceIds:
				candidate.layer.effect === 'highlight' || candidate.layer.effect === 'highlight-on-white'
					? new Set([candidate.layer.shape.sourceId])
					: noPaintSources()
		};
	}
	if (candidate.kind === 'group') {
		const hits = candidate.children.flatMap(child => {
			const hit = preparedPaintAt(child, x, y);

			return hit ? [hit] : [];
		});

		return applyGroupComposite(candidate.layer, resolvePaintStack(hits, 'transparent'));
	}
	if (!pointInPreparedClips(candidate.clipIntervals, x)) return null;
	if (candidate.kind === 'box') {
		const { box, effect } = candidate.layer;

		return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
			? { effect, sourceIds: noPaintSources() }
			: null;
	}

	return imagePaintAt(candidate.layer.region, x, y);
}

/**
 * Устойчивая горизонтальная доля строки, занятая цветным выделением. Для каждой
 * высоты сначала считается точное объединение контуров, затем берётся медиана
 * по вертикали. Поэтому хвост маркера, попавший в край соседней строки, не
 * превращает её в отмеченный ответ, а частичное выделение слова сохраняется.
 */
function measureHighlight(
	x0: number,
	x1: number,
	y: number,
	size: number,
	paintLayers: PaintLayer[]
): {
	fraction: number;
	visibleFraction: number;
	sources: Array<{
		id: string;
		kind: HighlightSourceKind;
		fraction: number;
		visibleFraction: number;
	}>;
	ambiguous: boolean;
} {
	const lineWidth = x1 - x0;
	if (lineWidth <= 0) {
		return { fraction: 0, visibleFraction: 0, sources: [], ambiguous: false };
	}

	const rows = 9;
	const yLo = y - size * 0.25;
	const yHi = y + size * 0.85;
	const cols = Math.max(16, Math.min(400, Math.round(lineWidth / 1.5)));
	const rowFractions: number[] = [];
	const uncertainRowFractions: number[] = [];
	const sourceRows = new Map<string, number[]>();
	const localLayers = paintLayers
		.filter(layer => {
			const box = paintLayerBox(layer);

			return yHi >= box.y0 && yLo <= box.y1 && x1 >= box.x0 && x0 <= box.x1;
		})
		.sort((left, right) => right.paintOrder - left.paintOrder);
	for (let r = 0; r < rows; r++) {
		const yy = yLo + ((yHi - yLo) * (r + 0.5)) / rows;
		const prepared = localLayers
			.map(layer => preparePaintLayer(layer, yy, x0, x1))
			.filter((layer): layer is PreparedPaintLayer => layer !== null);
		let colored = 0;
		let uncertain = 0;
		const sourceCounts = new Map<string, number>();
		for (let c = 0; c < cols; c++) {
			const x = x0 + (lineWidth * (c + 0.5)) / cols;
			const hit = resolvePaintStack(
				prepared.flatMap(candidate => {
					const paint = preparedPaintAt(candidate, x, yy);

					return paint ? [paint] : [];
				}),
				'white'
			);
			if (hit?.effect === 'highlight' || hit?.effect === 'highlight-on-white') {
				colored++;
				for (const sourceId of hit.sourceIds) {
					sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
				}
			} else if (hit?.effect === 'uncertain') {
				uncertain++;
			}
		}
		rowFractions.push(colored / cols);
		uncertainRowFractions.push(uncertain / cols);
		for (const [sourceId, count] of sourceCounts) {
			const values = sourceRows.get(sourceId) ?? Array(rows).fill(0);
			values[r] = count / cols;
			sourceRows.set(sourceId, values);
		}
	}
	// Крайние sample-ряды нужны только для геометрического запаса. Решение
	// строится по центральной зоне глифа: так полоса соседней строки не становится
	// ответом, а тонкий реальный маркер внутри текста остаётся неоднозначным.
	const coreValues = (values: number[]) => values.slice(3, 6);
	const stableFraction = (values: number[]) => {
		const sorted = coreValues(values).sort((a, b) => a - b);

		return sorted[Math.floor(sorted.length / 2)];
	};
	// Один крайний sample внутри core ещё может принадлежать соседней строке.
	// Для зоны неопределённости нужен след именно на середине высоты глифа.
	const visibleFraction = (values: number[]) => values[Math.floor(rows / 2)];
	const sourceKind = (id: string): HighlightSourceKind => {
		const kind = id.split(':')[1];

		return kind === 'annotation' || kind === 'image' || kind === 'path' ? kind : 'unknown';
	};
	const sourceFractions = [...sourceRows].flatMap(([id, values]) => {
		const visible = visibleFraction(values);
		const fraction = stableFraction(values);

		return visible > 0 ? [{ id, kind: sourceKind(id), fraction, visibleFraction: visible }] : [];
	});
	const uncertainWidth = visibleFraction(uncertainRowFractions) * lineWidth;
	const ambiguous = uncertainWidth > Math.min(size * 0.25, lineWidth * 0.1);

	return {
		fraction: stableFraction(rowFractions),
		visibleFraction: visibleFraction(rowFractions),
		sources: sourceFractions,
		ambiguous
	};
}

function paintLayerBox(layer: PaintLayer): Box {
	if (layer.kind === 'vector') return layer.shape;
	if (layer.kind === 'raster') return layer.region;

	return layer.box;
}

function enclosingPaintBox(layers: PaintLayer[]): Box | null {
	if (layers.length === 0) return null;
	const boxes = layers.map(paintLayerBox);

	return {
		x0: Math.min(...boxes.map(box => box.x0)),
		y0: Math.min(...boxes.map(box => box.y0)),
		x1: Math.max(...boxes.map(box => box.x1)),
		y1: Math.max(...boxes.map(box => box.y1))
	};
}

async function resolvePaintLayer(
	layer: RawPaintLayer,
	page: PdfPage,
	pageBox: Box
): Promise<PaintLayer | null> {
	if (layer.kind === 'vector' || layer.kind === 'box') return layer;
	if (layer.kind === 'group') {
		const children = await resolvePaintLayers(layer.children, page, pageBox);
		const box = enclosingPaintBox(children);
		if (!box) return null;

		return {
			kind: 'group',
			paintOrder: layer.paintOrder,
			box,
			children,
			composite: layer.composite,
			supported: layer.supported
		};
	}

	const paint = layer.paint;
	const { id, annotationId } = paint;
	if (paint.uncertain) {
		return {
			kind: 'box',
			paintOrder: paint.paintOrder,
			effect: 'uncertain',
			box: paint.box,
			clips: paint.clips
		};
	}
	const image = paint.image ?? (id ? await resolveImage(page, id, 3000) : null);
	if (!image) {
		return {
			kind: 'box',
			paintOrder: paint.paintOrder,
			effect: 'uncertain',
			box: paint.box,
			clips: paint.clips
		};
	}
	// В appearance stream полупрозрачный маркер иногда хранится как тёмный
	// RGB (около 64–128) плюс alpha. Для обычных изображений оставляем
	// более строгий порог, чтобы не считать цветные иллюстрации маркером.
	const decoded = buildImageRegion(
		image,
		paint,
		annotationId ? 60 : 100,
		// Appearance stream уже содержит визуально скомпозитованный бледный
		// маркер. Для него нужен порог различимого, а не насыщенного оттенка.
		annotationId ? 6 : 22,
		coversWholePage(paint.box, pageBox) &&
			paint.clips.every(clip => fillShapeCoversBox(clip, pageBox))
	);
	if (decoded.kind === 'transparent') return null;
	if (decoded.kind === 'unreadable') {
		return {
			kind: 'box',
			paintOrder: paint.paintOrder,
			effect: 'uncertain',
			box: paint.box,
			clips: paint.clips
		};
	}

	return {
		kind: 'raster',
		paintOrder: paint.paintOrder,
		region: decoded.region
	};
}

/** Декодирует raster-слои последовательно, ограничивая пиковую память одной картинкой. */
async function resolvePaintLayers(
	layers: RawPaintLayer[],
	page: PdfPage,
	pageBox: Box
): Promise<PaintLayer[]> {
	const resolved: PaintLayer[] = [];
	for (const layer of layers) {
		const paint = await resolvePaintLayer(layer, page, pageBox);
		if (paint) resolved.push(paint);
	}

	return resolved;
}

function annotationBox(rect: number[] | undefined): Box | null {
	if (!rect || rect.length !== 4 || !rect.every(Number.isFinite)) return null;

	return {
		x0: Math.min(rect[0], rect[2]),
		y0: Math.min(rect[1], rect[3]),
		x1: Math.max(rect[0], rect[2]),
		y1: Math.max(rect[1], rect[3])
	};
}

async function extractPage(
	page: PdfPage,
	textPage: PdfTextPageState,
	pdfjs: PdfJsModule,
	optionalContent: PdfOptionalContentConfig,
	columnCentersHint: number[] | null,
	pageNumberItemIds: Set<string>
): Promise<{ lines: DocLine[]; columnCenters: number[] | null }> {
	const pageBox: Box = {
		x0: textPage.pageLeft,
		y0: textPage.pageBottom,
		x1: textPage.pageLeft + textPage.pageWidth,
		y1: textPage.pageBottom + textPage.pageHeight
	};

	const opList = await page.getOperatorList();
	const {
		paintLayers: rawPaintLayers,
		runs,
		seenAnnotationIds,
		nextPaintOrder
	} = walkOperatorList(
		opList.fnArray,
		opList.argsArray,
		pdfjs.OPS,
		pageBox,
		textPage.page,
		optionalContent
	);
	assignFontFlags(page, textPage.items);

	const paintLayers = await resolvePaintLayers(rawPaintLayers, page, pageBox);

	// Точный источник истины — реально отрисованный operator list. Метаданные
	// аннотации не подменяют appearance: для видимой, но не представленной
	// pdf.js аннотации известна только область возможного эффекта, поэтому она
	// становится fail-closed ambiguity. Пустой/скрытый appearance не синтезируем.
	const annotations = await page.getAnnotations();
	let annotationPaintOrder = nextPaintOrder;
	for (const annotation of annotations) {
		if (!annotation.subtype || !HIGHLIGHT_ANNOTATIONS.has(annotation.subtype)) continue;
		if (annotation.id && seenAnnotationIds.has(annotation.id)) continue;
		if (((annotation.annotationFlags ?? 0) & NON_RENDERED_ANNOTATION_FLAGS) !== 0) continue;
		paintLayers.push({
			kind: 'box',
			paintOrder: annotationPaintOrder++,
			effect: 'uncertain',
			box: annotationBox(annotation.rect) ?? pageBox,
			clips: []
		});
	}

	// Сопоставление идёт по исходному stream-порядку. Удалять колонтитулы до
	// этого шага нельзя: последующие цвета могли бы сдвинуться на соседний текст.
	assignColors(textPage.items, runs);

	// Подтверждённые исходные фрагменты исключаются до раскладки колонок и
	// сборки строк, поэтому не влияют ни на текст, ни на геометрию строки.
	const groups = groupPdfItemsByBaseline(
		textPage.items.filter(item => !pageNumberItemIds.has(item.id))
	);

	const lines: DocLine[] = [];
	const lineColumns: number[] = [];
	const arrangedPage = arrangePdfPageGroups(
		groups,
		textPage.pageLeft,
		textPage.pageWidth,
		columnCentersHint
	);
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
			if (item.bold) boldLen += len;
			if (item.italic) italicLen += len;
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

		const highlight = measureHighlight(x0, x1, y, size, paintLayers);

		lines.push({
			page: textPage.page,
			y,
			x0,
			x1,
			size,
			text,
			boldFrac: totalLen > 0 ? boldLen / totalLen : 0,
			italicFrac: totalLen > 0 ? italicLen / totalLen : 0,
			color,
			highlightFrac: highlight.fraction,
			highlightVisibleFrac: highlight.visibleFraction,
			highlightSources: highlight.sources,
			highlightAmbiguous: highlight.ambiguous,
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
		const optionalContent = await doc.getOptionalContentConfig({ intent: 'display' });
		const textPages: PdfTextPageState[] = [];
		for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
			textPages.push(await extractPageTextState(await doc.getPage(pageNumber), pageNumber));
		}
		const pageNumberItemIds = findConfirmedPageNumberItemIds(textPages);

		const lines: DocLine[] = [];
		let columnCentersHint: number[] | null = null;
		for (const textPage of textPages) {
			const page = await extractPage(
				await doc.getPage(textPage.page),
				textPage,
				pdfjs,
				optionalContent,
				columnCentersHint,
				pageNumberItemIds
			);
			lines.push(...page.lines);
			columnCentersHint = page.columnCenters;
		}

		return lines;
	} finally {
		await task.destroy().catch(() => undefined);
	}
}
