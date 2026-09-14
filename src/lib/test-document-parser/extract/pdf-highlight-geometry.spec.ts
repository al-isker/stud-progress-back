import {
	decodePdfFillShape,
	decodePdfStrokeShape,
	fillShapeCoversBox,
	highlightIntervalsAtY,
	pointInIntervals,
	splitDisconnectedFillShape
} from './pdf-highlight-geometry';

describe('PDF highlight geometry', () => {
	test('uses the real concave contour instead of its bounding box', () => {
		const shape = decodePdfFillShape(
			[
				0,
				0,
				0, // moveTo
				1,
				4,
				0, // lineTo
				1,
				4,
				1,
				1,
				1,
				1,
				1,
				1,
				4,
				1,
				0,
				4,
				4 // closePath
			],
			[2, 0, 0, 3, 10, 20],
			false,
			'concave-fill'
		);
		if (!shape) throw new Error('Shape was not decoded');

		const intervals = highlightIntervalsAtY([shape], 29, 0, 30);
		expect(pointInIntervals(intervals, 11)).toBe(true);
		// Точка лежит внутри bbox преобразованного пути, но вне самого контура.
		expect(pointInIntervals(intervals, 16)).toBe(false);
	});

	test('accepts only numerically noisy similarity transforms for exact PDF strokes', () => {
		const noisySimilarity = decodePdfStrokeShape(
			[0, 0, 0, 1, 10, 0],
			[1.00000002, 0, 0, 1.00000327, 0, 0],
			2,
			1,
			0,
			'noisy-similarity'
		);
		const anisotropic = decodePdfStrokeShape(
			[0, 0, 0, 1, 10, 0],
			[1.1, 0, 0, 1, 0, 0],
			2,
			1,
			0,
			'anisotropic'
		);

		expect(noisySimilarity).not.toBeNull();
		expect(anisotropic).toBeNull();
	});

	test('requires a round join only when a stroke actually has a join', () => {
		expect(
			decodePdfStrokeShape([0, 0, 0, 1, 10, 0], [1, 0, 0, 1, 0, 0], 2, 1, 0, 'segment')
		).not.toBeNull();
		expect(
			decodePdfStrokeShape([0, 0, 0, 1, 10, 0, 1, 10, 10], [1, 0, 0, 1, 0, 0], 2, 1, 0, 'polyline')
		).toBeNull();
	});

	test('assigns separate sources to disconnected contours of one fill operation', () => {
		const shape = decodePdfFillShape(
			[0, 0, 0, 1, 10, 0, 1, 10, 5, 1, 0, 5, 4, 0, 0, 20, 1, 10, 20, 1, 10, 25, 1, 0, 25, 4],
			[1, 0, 0, 1, 0, 0],
			false,
			'fill'
		);
		if (!shape) throw new Error('Fill shape was not decoded');

		const sources = splitDisconnectedFillShape(shape);

		expect(sources).toHaveLength(2);
		expect(sources.map(source => source.sourceId)).toEqual(['fill:1', 'fill:2']);
	});

	test('distinguishes a full-page fill from disconnected shapes with a page-sized bounding box', () => {
		const page = { x0: 0, y0: 0, x1: 100, y1: 100 };
		const background = decodePdfFillShape(
			[0, 0, 0, 1, 100, 0, 1, 100, 100, 1, 0, 100, 4],
			[1, 0, 0, 1, 0, 0],
			false,
			'background'
		);
		const corners = decodePdfFillShape(
			[
				0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4, 0, 90, 90, 1, 100, 90, 1, 100, 100, 1, 90, 100, 4
			],
			[1, 0, 0, 1, 0, 0],
			false,
			'corners'
		);
		if (!background || !corners) throw new Error('Geometry was not decoded');

		expect(fillShapeCoversBox(background, page)).toBe(true);
		expect(fillShapeCoversBox(corners, page)).toBe(false);
	});

	test('intersects highlight geometry with every active clipping path', () => {
		const fill = decodePdfFillShape(
			[0, 0, 0, 1, 10, 0, 1, 10, 10, 1, 0, 10, 4],
			[1, 0, 0, 1, 0, 0],
			false,
			'fill'
		);
		const clip = decodePdfFillShape(
			[0, 0, 0, 1, 4, 0, 1, 4, 10, 1, 0, 10, 4],
			[1, 0, 0, 1, 0, 0],
			false,
			'clip'
		);
		if (!fill || !clip) throw new Error('Geometry was not decoded');
		fill.clips = [clip];

		expect(highlightIntervalsAtY([fill], 5, 0, 10)).toEqual([[0, 4]]);
	});
});
