import { PositionedPdfItem, arrangePdfPageGroups } from './pdf-layout';

interface Item extends PositionedPdfItem {
	id: string;
}

const item = (id: string, x: number, y: number, w = 20): Item => ({
	id,
	x,
	y,
	w,
	size: 10
});

describe('arrangePdfPageGroups', () => {
	test('never splits one continuous fragment between confirmed columns', () => {
		const groups = [
			[item('left-1', 50, 500), item('right-1', 350, 500)],
			[item('left-2', 50, 480), item('right-2', 350, 480)],
			[item('target-start', 50, 460, 270), item('target-end', 330, 460)]
		];

		const result = arrangePdfPageGroups(groups, 0, 600, [50, 350]);
		const target = result.groups.find(group =>
			group.items.some(current => current.id === 'target-start')
		);

		expect(result.columnCenters).toEqual([50, 350]);
		expect(target).toMatchObject({ column: 0 });
		expect(target?.items.map(current => current.id)).toEqual(['target-start', 'target-end']);
	});

	test('rejects a column layout that cuts a continuous body fragment', () => {
		const groups = [
			[item('left-1', 50, 500), item('right-1', 350, 500)],
			[item('crossing-start', 50, 490, 270), item('crossing-end', 330, 490)],
			[item('left-2', 50, 480), item('right-2', 350, 480)]
		];

		const result = arrangePdfPageGroups(groups, 0, 600, [50, 350]);

		expect(result.columnCenters).toBeNull();
		expect(result.groups).toHaveLength(3);
	});

	test('detects independently repeated columns separated by a gutter', () => {
		const groups = Array.from({ length: 6 }, (_, index) => [
			item(`left-${index}`, 50, 500 - index * 20),
			item(`right-${index}`, 350, 500 - index * 20)
		]);

		const result = arrangePdfPageGroups(groups, 0, 600, null);

		expect(result.columnCenters).toEqual([50, 350]);
		expect(result.groups.filter(group => group.column === 0)).toHaveLength(6);
		expect(result.groups.filter(group => group.column === 1)).toHaveLength(6);
	});

	test('does not combine sparse distant fragments into a column', () => {
		const groups = [
			...Array.from({ length: 40 }, (_, index) => [item(`left-${index}`, 50, 800 - index * 10)]),
			...Array.from({ length: 2 }, (_, index) => [item(`middle-${index}`, 350, 700 - index * 10)]),
			...Array.from({ length: 3 }, (_, index) => [item(`right-${index}`, 520, 700 - index * 10)])
		];

		const result = arrangePdfPageGroups(groups, 0, 600, null);

		expect(result.columnCenters).toBeNull();
		expect(result.groups.every(group => group.column === 0)).toBe(true);
	});

	test('keeps independently repeated columns and ignores sparse noise', () => {
		const groups = [
			...Array.from({ length: 6 }, (_, index) => [item(`left-${index}`, 50, 500 - index * 20)]),
			...Array.from({ length: 6 }, (_, index) => [item(`right-${index}`, 350, 500 - index * 20)]),
			[item('noise', 520, 450)]
		];

		const result = arrangePdfPageGroups(groups, 0, 600, null);

		expect(result.columnCenters).toEqual([50, 350]);
	});

	test('does not confirm a hint with words inside continuous lines', () => {
		const groups = [
			[item('start-1', 50, 500, 280), item('end-1', 340, 500)],
			[item('start-2', 50, 480, 280), item('end-2', 340, 480)]
		];

		const result = arrangePdfPageGroups(groups, 0, 600, [50, 350]);

		expect(result.columnCenters).toBeNull();
	});

	test('joins fragments from one baseline when they belong to the same column', () => {
		const groups = [
			[item('left-1', 50, 500), item('right-1', 350, 500)],
			[item('left-2', 50, 480), item('right-2', 350, 480)],
			[item('part-1', 50, 460), item('part-2', 100, 460)]
		];

		const result = arrangePdfPageGroups(groups, 0, 600, [50, 350]);
		const baselineGroups = result.groups.filter(group => group.items[0].y === 460);

		expect(baselineGroups).toHaveLength(1);
		expect(baselineGroups[0].items.map(current => current.id)).toEqual(['part-1', 'part-2']);
	});
});
