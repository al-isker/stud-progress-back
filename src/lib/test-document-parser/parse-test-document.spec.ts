import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseTestDocument } from './parse-test-document';
import { ParseRejectionReason, ParseStatus } from './types/parse-result';

jest.setTimeout(120000);

interface FixtureCase {
	name: string;
	dir: string;
}

const FIXTURES_DIR = join(__dirname, 'fixtures');

/** Находит все папки-кейсы непосредственно внутри fixtures/. */
function discoverCases(): FixtureCase[] {
	return readdirSync(FIXTURES_DIR)
		.sort()
		.map(name => ({ name, dir: join(FIXTURES_DIR, name) }))
		.filter(entry => statSync(entry.dir).isDirectory());
}

/** Читает единственный документ кейса, игнорируя файлы метаданных. */
function readDocument(dir: string): { filename: string; data: Buffer } {
	const filename = readdirSync(dir).find(file => {
		const lower = file.toLowerCase();

		return lower !== 'expected.json' && !file.startsWith('.');
	});

	if (!filename) {
		throw new Error(`No document file found in fixture case: ${dir}`);
	}

	return { filename, data: readFileSync(join(dir, filename)) };
}

const cases = discoverCases();

if (cases.length === 0) {
	test('корпус фикстур пуст — добавь кейсы в fixtures/NNN', () => {
		expect(cases).toEqual([]);
	});
}

if (cases.length > 0) {
	describe('fixtures', () => {
		for (const { name, dir } of cases) {
			test(`${name} → expected result`, async () => {
				const { filename, data } = readDocument(dir);
				const result = await parseTestDocument({ data, filename });

				const expectedPath = join(dir, 'expected.json');
				if (!existsSync(expectedPath)) {
					throw new Error(`No expected.json found for fixture: ${name}`);
				}
				const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));

				expect(result).toEqual(expected);
			});
		}
	});
}

test('неподдерживаемый формат → rejected', async () => {
	const result = await parseTestDocument({ data: Buffer.from('not a PDF') });

	expect(result).toEqual({
		status: ParseStatus.REJECTED,
		reason: ParseRejectionReason.UNSUPPORTED_FORMAT
	});
});
