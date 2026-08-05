import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseTestDocument } from './parse-test-document';
import { ParseRejectionReason, ParseStatus } from './types/parse-result';

jest.setTimeout(120000);

type Validity = 'valid' | 'invalid';

interface FixtureCase {
	name: string;
	dir: string;
}

const FIXTURES_DIR = join(__dirname, 'fixtures');

/** Находит все папки-кейсы внутри fixtures/<validity>. */
function discoverCases(validity: Validity): FixtureCase[] {
	const base = join(FIXTURES_DIR, validity);

	if (!existsSync(base)) {
		return [];
	}

	return readdirSync(base)
		.sort()
		.map(name => ({ name, dir: join(base, name) }))
		.filter(entry => statSync(entry.dir).isDirectory());
}

/** Читает единственный файл-документ кейса (не README.md и не expected.json). */
function readDocument(dir: string): { filename: string; data: Buffer } {
	const filename = readdirSync(dir).find(file => {
		const lower = file.toLowerCase();

		return lower !== 'readme.md' && lower !== 'expected.json' && !file.startsWith('.');
	});

	if (!filename) {
		throw new Error(`No document file found in fixture case: ${dir}`);
	}

	return { filename, data: readFileSync(join(dir, filename)) };
}

const acceptedCases = discoverCases('valid');
const rejectedCases = discoverCases('invalid');

if (acceptedCases.length === 0 && rejectedCases.length === 0) {
	// Корпус ещё не наполнен — держим заглушку, чтобы у suite был хотя бы один тест.
	test('корпус фикстур пуст — добавь кейсы в fixtures/valid|invalid', () => {
		expect([...acceptedCases, ...rejectedCases]).toEqual([]);
	});
}

if (acceptedCases.length > 0) {
	describe('accepted', () => {
		for (const { name, dir } of acceptedCases) {
			test(`${name} → accepted`, async () => {
				const { filename, data } = readDocument(dir);
				const result = await parseTestDocument({ data, filename });

				expect(result.status).toBe(ParseStatus.ACCEPTED);

				const expectedPath = join(dir, 'expected.json');
				if (!existsSync(expectedPath)) {
					throw new Error(`No expected.json found for accepted fixture: ${name}`);
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

if (rejectedCases.length > 0) {
	describe('rejected', () => {
		for (const { name, dir } of rejectedCases) {
			test(`${name} → rejected`, async () => {
				const { filename, data } = readDocument(dir);

				const result = await parseTestDocument({ data, filename });

				expect(result.status).toBe(ParseStatus.REJECTED);
			});
		}
	});
}
