import { resolvePercentageMarker } from './detect-percentage-marker';
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
	test('uses only the leading score and keeps percentages inside answer text', () => {
		const result = resolvePercentageMarker(
			question([
				option('33.33333%0,9% раствор', '~%', '~%'),
				option('-50%60–80% массы', '~%-', '~%'),
				option('33.33333%обычный ответ', '~%', '~%'),
				option('-50%ещё один ответ', '~%-', '~%'),
				option('33.33333%100% содержания', '~%', '~%')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [false, true, false, true, false],
			consumedTextPrefixes: ['33.33333%', '-50%', '33.33333%', '-50%', '33.33333%']
		});
	});

	test('supports percentage syntax mixed with a shorter structural prefix', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50% first', '~%', '~'),
				option('%-33.33333% second', '~%-', '~'),
				option('%50% third', '~%', '~')
			])
		);

		expect(result).toEqual({
			recognized: true,
			resolved: true,
			marked: [true, false, true],
			consumedTextPrefixes: ['%50% ', '%-33.33333% ', '%50% ']
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

	test('requires a service score on every option', () => {
		const result = resolvePercentageMarker(
			question([
				option('%50% scored option', '~%', '~'),
				option('ordinary option', '~', '~'),
				option('correct ordinary option', '=', '=')
			])
		);

		expect(result).toEqual({ recognized: false });
	});

	test('recognizes but does not resolve a score with a unique maximum', () => {
		const result = resolvePercentageMarker(
			question([
				option('25% first', '~%', '~%'),
				option('-50% second', '~%-', '~%'),
				option('25% third', '~%', '~%')
			])
		);

		expect(result).toEqual({ recognized: true, resolved: false });
	});

	test('does not resolve a score shared by every option', () => {
		const result = resolvePercentageMarker(
			question([
				option('50% first', '~%', '~%'),
				option('-50% second', '~%-', '~%'),
				option('50% third', '~%', '~%')
			])
		);

		expect(result).toEqual({ recognized: true, resolved: false });
	});
});
