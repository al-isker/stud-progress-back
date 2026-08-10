import { percentageTextPrefixes, resolvePercentageMarker } from './detect-percentage-marker';
import { RawOption, RawQuestion } from './segment';

function option(text: string, sourcePrefix: string, structuralPrefix: string): RawOption {
	return {
		sourcePrefix,
		structuralPrefix,
		hasTextAfterSourcePrefix: true,
		texts: [text],
		lines: []
	};
}

const question = (options: RawOption[]): RawQuestion => ({ texts: ['Question'], options });

describe('resolvePercentageMarker', () => {
	test('does not treat a literal percent answer after the global equals prefix as a score', () => {
		const result = resolvePercentageMarker(
			question([option('%', '=%', '='), option('mm Hg', '=', '='), option('kPa', '=', '=')])
		);

		expect(result).toEqual({ recognized: false });
	});

	test('uses only the leading score and keeps percentages inside answer text', () => {
		const result = resolvePercentageMarker(
			question([
				option('%33.33333%0,9% раствор', '~%', '~'),
				option('%-50%60–80% массы', '~%-', '~'),
				option('%33.33333%обычный ответ', '~%', '~'),
				option('%-50%ещё один ответ', '~%-', '~'),
				option('%33.33333%100% содержания', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true, false, true],
			consumedTextPrefixes: ['%33.33333%', '%-50%', '%33.33333%', '%-50%', '%33.33333%']
		});
	});

	test('supports a space between the structural prefix and percentage score', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50% first', '~', '~'),
				option('%-33.33333% second', '~', '~'),
				option('%50% third', '~', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true],
			consumedTextPrefixes: ['%50% ', '%-33.33333% ', '%50% ']
		});
	});

	test('supports spaces around the score sign', () => {
		const result = resolvePercentageMarker(
			question([
				option('% 50% first', '~%', '~'),
				option('% - 100% second', '~%', '~'),
				option('% 50% third', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true],
			consumedTextPrefixes: ['% 50% ', '% - 100% ', '% 50% ']
		});
	});

	test('restores a percent consumed by the inferred structural prefix', () => {
		const result = resolvePercentageMarker(
			question([
				option('50% first', '~%', '~%'),
				option('-33.33333% second', '~%-', '~%'),
				option('50% third', '~%', '~%')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true],
			consumedTextPrefixes: ['50% ', '-33.33333% ', '50% ']
		});
	});

	test('does not treat ordinary percentage answers as marker scores', () => {
		const result = resolvePercentageMarker(
			question([
				option('1% solution', '~', '~'),
				option('2% solution', '~', '~'),
				option('2% solution', '=', '=')
			])
		);

		expect(result).toEqual({ recognized: false });
	});

	test('does not override an ordinary equals marker in a mixed question', () => {
		const raw = question([
			option('%50% scored option', '~%', '~'),
			option('ordinary option', '~', '~'),
			option('correct ordinary option', '=', '=')
		]);
		const result = resolvePercentageMarker(raw);

		expect(result).toEqual({ recognized: false });
		expect(percentageTextPrefixes(raw)).toEqual(['%50% ', null, null]);
	});

	test('does not resolve an empty or duplicated score', () => {
		const empty = question([
			option('%50% first', '~%', '~'),
			option('%50%', '~%', '~'),
			option('%-50% third', '~%-', '~')
		]);
		const duplicated = question([
			option('%50%%50% first', '~%', '~'),
			option('%50% second', '~%', '~'),
			option('%-50% third', '~%-', '~')
		]);

		expect(resolvePercentageMarker(empty)).toEqual({ recognized: true, resolved: false });
		expect(percentageTextPrefixes(empty)).toEqual(['%50% ', '%50%', '%-50% ']);
		expect(resolvePercentageMarker(duplicated)).toEqual({
			recognized: true,
			resolved: false
		});
	});

	test('uses zero for an unscored tilde option', () => {
		const result = resolvePercentageMarker(
			question([
				option('ordinary wrong option', '~', '~'),
				option('%50% first correct', '~%', '~'),
				option('another wrong option', '~', '~'),
				option('%50% second correct', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [false, true, false, true],
			consumedTextPrefixes: [null, '%50% ', null, '%50% ']
		});
	});

	test('resolves a score with a unique positive maximum as single', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50% first', '~%', '~'),
				option('%25% second', '~%', '~'),
				option('%25% third', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, false],
			consumedTextPrefixes: ['%50% ', '%25% ', '%25% ']
		});
	});

	test('does not resolve a nested tilde option marker', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50%~first', '~%', '~'),
				option('%50% second', '~%', '~'),
				option('%-50% third', '~%-', '~')
			])
		);

		expect(result).toEqual({ recognized: true, resolved: false });
	});

	test('supports a space after the decimal separator', () => {
		const result = resolvePercentageMarker(
			question([
				option('%33, 33333% first', '~%', '~'),
				option('%-50% second', '~%', '~'),
				option('%33,33333% third', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true],
			consumedTextPrefixes: ['%33, 33333% ', '%-50% ', '%33,33333% ']
		});
	});

	test('marks every option when all share the same positive maximum', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50% first', '~%', '~'),
				option('%50% second', '~%', '~'),
				option('%50% third', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, true, true],
			consumedTextPrefixes: ['%50% ', '%50% ', '%50% ']
		});
	});
});
