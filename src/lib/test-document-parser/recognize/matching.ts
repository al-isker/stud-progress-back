import { MatchingPair } from '../types/test-document';
import { RawOption, RawQuestion } from './segment';

interface TextOption {
	text: string;
}

type PairSeparatorKind = 'equals' | 'arrow';

const PAIR_SEPARATOR = /=>|[-\u2010-\u2015]\s*>|[→⟶⇒]|=/g;

interface ParsedPair {
	pair: MatchingPair;
	separatorKind: PairSeparatorKind;
}

function splitPair(text: string): ParsedPair | null {
	for (const separator of text.matchAll(PAIR_SEPARATOR)) {
		const left = text.slice(0, separator.index).trim();
		const right = text.slice(separator.index + separator[0].length).trim();
		const separatorKind: PairSeparatorKind = separator[0] === '=' ? 'equals' : 'arrow';

		// `<->` и `<=>` — двунаправленные операторы формул, а не разделители пар.
		if (separatorKind === 'arrow' && left.endsWith('<')) continue;
		if (left && right) return { pair: { left, right }, separatorKind };
	}

	return null;
}

function parsePairs(options: TextOption[]): ParsedPair[] | null {
	if (options.length < 2) return null;
	const parsed = options.map(option => splitPair(option.text));
	if (parsed.some(pair => pair === null)) return null;

	const pairs = parsed as ParsedPair[];
	const separatorKind = pairs[0].separatorKind;
	if (pairs.some(pair => pair.separatorKind !== separatorKind)) return null;

	return pairs;
}

/**
 * Преобразует варианты в пары, только если каждый вариант содержит
 * поддерживаемый разделитель одного вида: либо `=`, либо стрелку. Разные
 * написания однонаправленной стрелки (`->`, `- >`, `–>`, `→`) считаются одним
 * видом. Первый разделитель отделяет стороны, последующие символы сохраняются
 * как часть правой стороны.
 */
export function parseMatchingPairs(options: TextOption[]): MatchingPair[] | null {
	return parsePairs(options)?.map(item => item.pair) ?? null;
}

function optionText(option: RawOption): string {
	return option.texts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Структурный кандидат: во всех вариантах есть разделитель одного вида. */
export function isMatchingCandidate(question: RawQuestion): boolean {
	return parsePairs(question.options.map(option => ({ text: optionText(option) }))) !== null;
}

/** Matching допускает только два состояния маркера: выделены все или ни один. */
export function hasMatchingMarkerPattern(marked: boolean[]): boolean {
	const markedCount = marked.filter(Boolean).length;

	return markedCount === 0 || markedCount === marked.length;
}
