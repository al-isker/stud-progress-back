import { AnswerMarkerProfile } from './detect-marker';
import { analyzePercentageSyntax, isOrdinaryEqualsQuestion } from './detect-percentage-marker';
import { RawOption, RawQuestion } from './segment';

function option(text: string, sourcePrefix = '~', structuralPrefix = '~'): RawOption {
	return {
		sourcePrefix,
		structuralPrefix,
		hasTextAfterSourcePrefix: true,
		texts: [text],
		lines: []
	};
}

const question = (options: RawOption[]): RawQuestion => ({ texts: ['Question'], options });

describe('percentage question syntax', () => {
	test('requires a complete score on every option', () => {
		const result = analyzePercentageSyntax(
			question([option('%50% first'), option('50% second'), option('ordinary third')])
		);

		expect(result).toEqual({
			kind: 'incomplete',
			evidenceIndices: [0],
			consumedTextPrefixes: ['%50% ', null, null]
		});
	});

	test('does not restore an opening percent missing from the source', () => {
		const result = analyzePercentageSyntax(
			question([option('50% first'), option('%-50% second'), option('%-50% third')])
		);

		expect(result.kind).toBe('incomplete');
	});

	test('uses a percent that was exactly consumed by the structural profile', () => {
		const result = analyzePercentageSyntax(
			question([
				option('50% first', '~%', '~%'),
				option('-50% second', '~%-', '~%'),
				option('-50% third', '~%-', '~%')
			])
		);

		expect(result).toEqual({
			kind: 'resolved',
			marked: [true, false, false],
			consumedTextPrefixes: ['50% ', '-50% ', '-50% ']
		});
	});

	test('treats everything after the closing percent as answer text', () => {
		const result = analyzePercentageSyntax(
			question([option('%50%%first'), option('%50%~second'), option('%50%+third')])
		);

		expect(result).toEqual({
			kind: 'resolved',
			marked: [true, true, true],
			consumedTextPrefixes: ['%50%', '%50%', '%50%']
		});
	});

	test('keeps ordinary percentages inside answer text', () => {
		const result = analyzePercentageSyntax(
			question([
				option('%33.33333%0,9% solution'),
				option('%-50%60–80% mass'),
				option('%33.33333%100% content')
			])
		);

		expect(result).toMatchObject({ kind: 'resolved', marked: [true, false, true] });
	});

	test('does not treat a bare percent answer as score grammar', () => {
		expect(
			analyzePercentageSyntax(question([option('%'), option('mm Hg'), option('kPa')]))
		).toEqual({
			kind: 'none',
			consumedTextPrefixes: [null, null, null]
		});
	});

	test('rejects a score without answer text', () => {
		const result = analyzePercentageSyntax(
			question([option('%50% first'), option('%50%'), option('%-50% third')])
		);

		expect(result.kind).toBe('incomplete');
	});

	test('supports spaces and comma in a score', () => {
		const result = analyzePercentageSyntax(
			question([
				option('% 33, 33333% first'),
				option('% - 50% second'),
				option('% 33,33333% third')
			])
		);

		expect(result).toMatchObject({ kind: 'resolved', marked: [true, false, true] });
	});

	test('supports a single fully scored option', () => {
		expect(analyzePercentageSyntax(question([option('%100% only')]))).toEqual({
			kind: 'resolved',
			marked: [true],
			consumedTextPrefixes: ['%100% ']
		});
	});

	test('does not choose an answer when every score is non-positive', () => {
		const result = analyzePercentageSyntax(
			question([option('%0% first'), option('%-50% second'), option('%0% third')])
		);

		expect(result.kind).toBe('unresolved');
	});

	test('allows incomplete percentage-looking text only after a confirmed equals marker', () => {
		const raw = question([
			option('%50% literal answer', '=%', '='),
			option('second', '~', '~'),
			option('third', '~', '~')
		]);
		const analysis = analyzePercentageSyntax(raw);
		const equalsProfile: AnswerMarkerProfile = {
			signals: [{ kind: 'symbol', prefix: '=' }],
			symbolPrefix: '='
		};

		expect(isOrdinaryEqualsQuestion(raw, analysis, equalsProfile)).toBe(true);
		expect(isOrdinaryEqualsQuestion(raw, analysis, null)).toBe(false);
	});
});
