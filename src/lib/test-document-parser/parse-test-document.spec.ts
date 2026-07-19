import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseTestDocument } from './parse-test-document';

type Validity = 'valid' | 'invalid';

interface FixtureCase {
	validity: Validity;
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
		.map(name => ({ validity, name, dir: join(base, name) }))
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

const validCases = discoverCases('valid');
const invalidCases = discoverCases('invalid');

if (validCases.length === 0 && invalidCases.length === 0) {
	// Корпус ещё не наполнен — держим заглушку, чтобы у suite был хотя бы один тест.
	test('корпус фикстур пуст — добавь кейсы в fixtures/valid|invalid', () => {
		expect([...validCases, ...invalidCases]).toEqual([]);
	});
} else {
	describe('valid', () => {
		test.each(validCases)('$name → valid', async ({ dir }) => {
			const { filename, data } = readDocument(dir);
			const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));

			const result = await parseTestDocument({ data, filename });

			expect(result.status).toBe('valid');

			if (result.status === 'valid') {
				expect(result.document).toEqual(expected);
			}
		});
	});

	describe('invalid', () => {
		test.each(invalidCases)('$name → invalid', async ({ dir }) => {
			const { filename, data } = readDocument(dir);

			const result = await parseTestDocument({ data, filename });

			expect(result.status).toBe('invalid');
		});
	});
}
