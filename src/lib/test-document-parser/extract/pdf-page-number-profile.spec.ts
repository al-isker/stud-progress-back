import {
	PdfPageNumberItem,
	PdfPageNumberPage,
	findConfirmedPageNumberItemIds
} from './pdf-page-number-profile';

const item = (
	id: string,
	str: string,
	x: number,
	y: number,
	overrides: Partial<PdfPageNumberItem> = {}
): PdfPageNumberItem => ({
	id,
	str,
	x,
	y,
	w: Math.max(5, str.length * 5),
	size: 10,
	fontFamily: 'serif',
	...overrides
});

const page = (
	pageNumber: number,
	footer: PdfPageNumberItem[],
	overrides: Partial<PdfPageNumberPage> = {}
): PdfPageNumberPage => ({
	page: pageNumber,
	pageLeft: 0,
	pageBottom: 0,
	pageWidth: 600,
	pageHeight: 800,
	items: [item(`body-${pageNumber}`, `Question ${pageNumber}`, 50, 700), ...footer],
	...overrides
});

const ids = (values: Set<string>): string[] => [...values].sort();

describe('findConfirmedPageNumberItemIds', () => {
	test('finds a page-number fragment sharing a baseline with document content', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [
				item(`answer-${pageNumber}`, '~answer', 50, 20),
				item(`number-${pageNumber}`, String(pageNumber), 575, 20, { w: 5 })
			])
		);

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-1',
			'number-2',
			'number-3'
		]);
	});

	test('recognizes an offset series and right alignment across digit widths', () => {
		const values = [9, 10, 11];
		const pages = values.map((value, index) => {
			const width = String(value).length * 5;

			return page(index + 1, [
				item(`number-${value}`, String(value), 580 - width, 20, { w: width })
			]);
		});

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-10',
			'number-11',
			'number-9'
		]);
	});

	test('removes every PDF item of a split numeric fragment', () => {
		const pages = [10, 11, 12].map((value, index) =>
			page(index + 1, [
				...String(value)
					.split('')
					.map((digit, digitIndex) =>
						item(`number-${value}-${digitIndex}`, digit, 570 + digitIndex * 5, 20, { w: 5 })
					)
			])
		);

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-10-0',
			'number-10-1',
			'number-11-0',
			'number-11-1',
			'number-12-0',
			'number-12-1'
		]);
	});

	test('keeps a structurally consistent sequence seen on only two pages', () => {
		const pages = [1, 2].map(pageNumber =>
			page(pageNumber, [item(`number-${pageNumber}`, String(pageNumber), 575, 20)])
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('keeps a local numeric sequence that does not characterize the document', () => {
		const pages = Array.from({ length: 10 }, (_, index) => {
			const pageNumber = index + 1;

			return page(
				pageNumber,
				pageNumber <= 3
					? [item(`number-${pageNumber}`, String(pageNumber), 575, 20)]
					: [item(`footer-${pageNumber}`, 'literal footer', 50, 20)]
			);
		});

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('keeps a sparse sequence without consecutive physical pages', () => {
		const pages = [1, 3, 5].map(pageNumber =>
			page(pageNumber, [item(`number-${pageNumber}`, String(pageNumber), 575, 20)])
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('keeps an outlier and confirms the remaining structural series', () => {
		const pages = [
			page(1, [item('number-11', '11', 570, 20)]),
			page(2, [item('number-12', '12', 570, 20)]),
			page(3, [item('outlier', '99', 570, 20)]),
			page(4, [item('number-14', '14', 570, 20)])
		];

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-11',
			'number-12',
			'number-14'
		]);
	});

	test('does not detach a number from the fragment containing answer text', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [
				item(`answer-${pageNumber}`, '~answer', 520, 20),
				item(`number-${pageNumber}`, String(pageNumber), 570, 20)
			])
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('combines mirrored odd and even page-number placements', () => {
		const pages = Array.from({ length: 6 }, (_, index) => {
			const pageNumber = index + 1;
			const x = pageNumber % 2 === 0 ? 575 : 20;

			return page(pageNumber, [item(`number-${pageNumber}`, String(pageNumber), x, 20)]);
		});

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual(
			pages.map(current => `number-${current.page}`).sort()
		);
	});

	test('keeps a page-synchronous numeric series outside the physical page margin', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [item(`number-${pageNumber}`, String(pageNumber), 575, 500)])
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('keeps page-synchronous author leads in the extended top margin', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [], {
				items: [
					item(`lead-${pageNumber}`, String(pageNumber), 50, 700),
					item(`body-${pageNumber}`, 'Question text', 50, 650),
					item(`footer-${pageNumber}`, 'literal footer', 50, 20)
				]
			})
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('recognizes a detached footer in the extended physical margin', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [], {
				items: [
					item(`number-${pageNumber}`, String(pageNumber), 575, 128),
					item(`body-${pageNumber}`, 'Question text', 50, 700),
					item(`answer-${pageNumber}`, 'Answer text', 50, 650)
				]
			})
		);

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-1',
			'number-2',
			'number-3'
		]);
	});

	test('keeps the only line of a page even after confirming the profile elsewhere', () => {
		const pages = [1, 2, 3].map(pageNumber =>
			page(pageNumber, [item(`number-${pageNumber}`, String(pageNumber), 575, 20)])
		);
		pages.push(
			page(4, [], {
				items: [item('number-4', '4', 575, 20)]
			})
		);

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual([
			'number-1',
			'number-2',
			'number-3'
		]);
	});

	test('combines long continuous series after section numbering restarts', () => {
		const pages = Array.from({ length: 8 }, (_, index) => {
			const pageNumber = index + 1;
			const printedNumber = pageNumber <= 4 ? pageNumber : pageNumber - 4;

			return page(pageNumber, [item(`number-${pageNumber}`, String(printedNumber), 575, 20)]);
		});

		expect(ids(findConfirmedPageNumberItemIds(pages))).toEqual(
			pages.map(current => `number-${current.page}`).sort()
		);
	});

	test('keeps independent increasing numeric series without an actual restart', () => {
		const printedNumbers = [101, 102, 103, 205, 206, 207];
		const pages = printedNumbers.map((printedNumber, index) =>
			page(index + 1, [item(`number-${index + 1}`, String(printedNumber), 575, 20)])
		);

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});

	test('keeps restart-like series separated by an unexplained evidence page', () => {
		const pages = [
			...Array.from({ length: 3 }, (_, index) =>
				page(index + 1, [item(`number-${index + 1}`, String(index + 1), 575, 20)])
			),
			page(4, [item('literal-footer', 'literal footer', 50, 20)]),
			...Array.from({ length: 3 }, (_, index) =>
				page(index + 5, [item(`number-${index + 5}`, String(index + 1), 575, 20)])
			)
		];

		expect(findConfirmedPageNumberItemIds(pages)).toEqual(new Set());
	});
});
