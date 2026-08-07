import { DocLine } from '../types/document-model';
import { resolveAnswerMarker } from './detect-marker';
import { hasMatchingMarkerPattern, isMatchingCandidate, parseMatchingPairs } from './matching';
import { RawOption, RawQuestion } from './segment';

const line = (text: string, highlightFrac: number): DocLine => ({
	page: 1,
	y: 100,
	x0: 10,
	x1: 200,
	size: 12,
	text,
	boldFrac: 0,
	italicFrac: 0,
	color: null,
	highlightFrac,
	gapBefore: 10
});

const rawOption = (text: string, highlightFrac = 0): RawOption => ({
	sourcePrefix: null,
	structuralPrefix: null,
	hasTextAfterSourcePrefix: false,
	texts: [text],
	lines: [line(text, highlightFrac)]
});

const question = (texts: string[], highlights: number[] = []): RawQuestion => ({
	texts: ['Произвольный текст вопроса'],
	options: texts.map((text, index) => rawOption(text, highlights[index] ?? 0))
});

describe('matching questions', () => {
	test('splits by the first equals sign and preserves subsequent signs', () => {
		expect(parseMatchingPairs([{ text: 'left=right' }, { text: 'term==description' }])).toEqual([
			{ left: 'left', right: 'right' },
			{ left: 'term', right: '=description' }
		]);
	});

	test('treats ASCII, typographic and Unicode arrows as one separator kind', () => {
		expect(
			parseMatchingPairs([
				{ text: 'Холодные ->ниже 20' },
				{ text: 'Индифферентные –> 38-39' },
				{ text: 'Канада → Оттава' },
				{ text: 'Италия - > Рим' }
			])
		).toEqual([
			{ left: 'Холодные', right: 'ниже 20' },
			{ left: 'Индифферентные', right: '38-39' },
			{ left: 'Канада', right: 'Оттава' },
			{ left: 'Италия', right: 'Рим' }
		]);
	});

	test('rejects different separator kinds inside one question', () => {
		expect(parseMatchingPairs([{ text: 'Канада=Оттава' }, { text: 'Италия->Рим' }])).toBeNull();
	});

	test('does not treat a bidirectional formula arrow as a pair separator', () => {
		expect(
			parseMatchingPairs([{ text: 'CO₂ + H₂O <-> H₂CO₃' }, { text: 'H₂CO₃ < - > H⁺ + HCO₃⁻' }])
		).toBeNull();
	});

	test('detects a structural candidate without inspecting question wording', () => {
		expect(isMatchingCandidate(question(['Canada=Ottawa', 'Italy=Rome']))).toBe(true);
		expect(isMatchingCandidate(question(['Canada=Ottawa', 'Italy->Rome']))).toBe(false);
		expect(isMatchingCandidate(question(['Canada=Ottawa', 'Italy and Rome']))).toBe(false);
	});

	test('accepts only ALL and NONE marker states', () => {
		expect(hasMatchingMarkerPattern([true, true, true])).toBe(true);
		expect(hasMatchingMarkerPattern([false, false, false])).toBe(true);
		expect(hasMatchingMarkerPattern([true, false, true])).toBe(false);
	});

	test('confirms a document containing only unmarked matching questions', () => {
		const matching = question(['First->1', 'Second->2']);

		expect(resolveAnswerMarker([matching])).toEqual({
			confirmed: true,
			marked: [[false, false]],
			matching: [true],
			ambiguous: [],
			consumedTextPrefixes: [[null, null]]
		});
	});

	test('does not let pair candidates influence global marker selection', () => {
		const formula = question(['ΔS=ΔQ/T', 'ΔS=ΔQv'], [1, 0]);
		const choice1 = question(['correct', 'wrong'], [1, 0]);
		const choice2 = question(['wrong', 'correct'], [0, 1]);
		const marker = resolveAnswerMarker([formula, choice1, choice2]);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.marked[0]).toEqual([true, false]);
		expect(marker.matching).toEqual([false, false, false]);
	});

	test('recognizes an ALL candidate after applying the global marker', () => {
		const matching = question(['Canada=Ottawa', 'Italy=Rome'], [1, 1]);
		const choice1 = question(['correct', 'wrong'], [1, 0]);
		const choice2 = question(['wrong', 'correct'], [0, 1]);
		const marker = resolveAnswerMarker([matching, choice1, choice2]);
		if (!marker.confirmed) throw new Error('Answer marker was not confirmed');

		expect(marker.marked[0]).toEqual([true, true]);
		expect(marker.matching).toEqual([true, false, false]);
	});
});
