import { DocLine } from '../types/document-model';
import { removeConfirmedPageNumbers } from './extract-pdf';

const line = (page: number, text: string, y: number, x0 = 50): DocLine => ({
	page,
	y,
	x0,
	x1: x0 + text.length * 6,
	size: 12,
	text,
	boldFrac: 0,
	italicFrac: 0,
	color: null,
	highlightFrac: 0,
	gapBefore: 15
});

describe('removeConfirmedPageNumbers', () => {
	test('removes a repeated page-number series from one document edge', () => {
		const lines = [
			line(1, 'Question 1', 700),
			line(1, '11', 30, 300),
			line(2, 'Question 2', 700),
			line(2, '12', 30, 297),
			line(3, 'Question 3', 700),
			line(3, '13', 30, 297)
		];

		expect(removeConfirmedPageNumbers(lines).map(item => item.text)).toEqual([
			'Question 1',
			'Question 2',
			'Question 3'
		]);
	});

	test('keeps numbers without enough repeated structural evidence', () => {
		const lines = [
			line(1, 'Question 1', 700),
			line(1, '1', 30, 300),
			line(2, 'Question 2', 700),
			line(2, '2', 30, 300),
			line(3, '3', 500, 50),
			line(3, 'Question 3', 30)
		];

		expect(removeConfirmedPageNumbers(lines)).toEqual([
			{ ...lines[0], gapBefore: null },
			lines[1],
			{ ...lines[2], gapBefore: null },
			lines[3],
			{ ...lines[4], gapBefore: null },
			lines[5]
		]);
	});
});
