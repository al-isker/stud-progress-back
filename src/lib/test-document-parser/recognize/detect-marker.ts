import { RawOption, RawQuestion } from './segment';

/** Один подтверждаемый документный способ выделения правильного варианта. */
export type AnswerMarkerSignal =
	| { kind: 'symbol'; prefix: string }
	| { kind: 'highlight'; floor: number }
	| { kind: 'bold'; threshold: number }
	| { kind: 'italic'; threshold: number }
	| { kind: 'color'; value: string };

/**
 * Документный профиль правильного ответа. Несколько сигналов означают, что
 * ведущие признаки по-разному размечают хотя бы один вопрос; при применении
 * профиль требует их согласия для конкретного вопроса.
 */
export interface AnswerMarkerProfile {
	signals: AnswerMarkerSignal[];
	/** Подтверждённый символьный префикс, который можно удалить из текста. */
	symbolPrefix: string | null;
}

export interface AppliedAnswerMarker {
	marked: boolean[];
	ambiguous: boolean;
	consumedTextPrefixes: (string | null)[];
}

/** Ровно половины недостаточно: формат подтверждает только строгое большинство. */
const hasStrictMajority = (count: number, total: number) => count > total / 2;

/** Агрегированные визуальные свойства варианта (по всем его строкам). */
interface OptionStyle {
	sourcePrefix: string | null;
	structuralPrefix: string | null;
	hasTextAfterSourcePrefix: boolean;
	hasTextAfterStructuralPrefix: boolean;
	highlight: number;
	bold: number;
	italic: number;
	color: string | null;
}

function styleOf(option: RawOption): OptionStyle {
	let width = 0;
	let highlight = 0;
	let bold = 0;
	let italic = 0;
	const colors = new Map<string, number>();
	for (const line of option.lines) {
		const w = Math.max(1, line.x1 - line.x0);
		width += w;
		highlight += line.highlightFrac * w;
		bold += line.boldFrac * w;
		italic += line.italicFrac * w;
		if (line.color) colors.set(line.color, (colors.get(line.color) ?? 0) + w);
	}
	let color: string | null = null;
	let best = 0;
	for (const [c, w] of colors) {
		if (w > best) {
			best = w;
			color = c;
		}
	}

	return {
		sourcePrefix: option.sourcePrefix,
		structuralPrefix: option.structuralPrefix,
		hasTextAfterSourcePrefix: option.hasTextAfterSourcePrefix,
		hasTextAfterStructuralPrefix: option.texts.some(text => text.trim() !== ''),
		highlight: width > 0 ? highlight / width : 0,
		bold: width > 0 ? bold / width : 0,
		italic: width > 0 ? italic / width : 0,
		color
	};
}

/** Разметка по булеву предикату: помечает варианты, для которых он истинен. */
function markByPredicate(styles: OptionStyle[][], test: (s: OptionStyle) => boolean): boolean[][] {
	return styles.map(qs => qs.map(test));
}

/**
 * Разметка по непрерывному признаку (выделение фоном) относительно братьев в
 * вопросе: в каждом вопросе помечаются варианты, чей признак заметно сильнее
 * прочих. Так засчитывается и бледное выделение (лишь бы оно выделялось на фоне
 * невыделенных вариантов), и не срабатывает слабый шум, если он низкий у всех.
 */
function markByRelativeScore(
	styles: OptionStyle[][],
	score: (s: OptionStyle) => number,
	floor: number
): boolean[][] {
	return styles.map(qs => {
		const scores = qs.map(score);
		const max = Math.max(...scores);
		if (max < floor) return qs.map(() => false);
		const threshold = Math.max(floor, max * 0.5);

		return scores.map(v => v >= threshold);
	});
}

/**
 * Кандидат-признак: его разметка и метрики отбора. Оценка ПО-ВОПРОСНАЯ: вопрос,
 * где признак пометил ноль или сразу все варианты, он не РАЗЛИЧАЕТ — такой
 * вопрос не участвует в выборе признака, но сам признак кандидатом остаётся
 * (одна аномалия не должна выбивать маркер на всех остальных вопросах).
 */
interface Candidate {
	sets: boolean[][];
	signal: AnswerMarkerSignal;
	/** Число вопросов, где признак различает ответ (помечено 1..n-1 вариантов). */
	coverage: number;
	/** Число вопросов, где признак присутствует (помечен хотя бы один вариант). */
	conforming: number;
	/** Средняя доля помеченных вариантов среди различённых вопросов. */
	avgFraction: number;
}

function toCandidate(
	sets: boolean[][],
	evaluationIndices: number[],
	signal: AnswerMarkerSignal
): Candidate {
	let coverage = 0;
	let conforming = 0;
	let fractionSum = 0;
	for (const questionIndex of evaluationIndices) {
		const qs = sets[questionIndex];
		const count = qs.filter(Boolean).length;
		if (count >= 1) conforming++;
		if (count >= 1 && count < qs.length) {
			coverage++;
			fractionSum += count / qs.length;
		}
	}

	return {
		sets,
		signal,
		coverage,
		conforming,
		avgFraction: coverage > 0 ? fractionSum / coverage : 1
	};
}

function markBySignal(styles: OptionStyle[][], signal: AnswerMarkerSignal): boolean[][] {
	switch (signal.kind) {
		case 'symbol':
			return markByPredicate(
				styles,
				style => style.sourcePrefix !== null && style.sourcePrefix.startsWith(signal.prefix)
			);
		case 'highlight':
			return markByRelativeScore(styles, style => style.highlight, signal.floor);
		case 'bold':
			return markByPredicate(styles, style => style.bold >= signal.threshold);
		case 'italic':
			return markByPredicate(styles, style => style.italic >= signal.threshold);
		case 'color':
			return markByPredicate(styles, style => style.color === signal.value);
	}
}

const questionSignature = (qs: boolean[]) => qs.map(b => (b ? '1' : '0')).join('');

/**
 * Ищет единственный признак, выделяющий правильные ответы на фоне остальных:
 * символьный префикс, цветовое выделение, жирность, курсив или цвет текста.
 * Формат един для переданного набора непроцентных вопросов, поэтому сначала
 * признак ПОДТВЕРЖДАЕТСЯ на всём наборе, а уже потом применяется к каждому
 * вопросу.
 *
 * Отбор: маркер выделяет меньшинство вариантов, поэтому признаки, в среднем
 * помечающие больше половины (например «~» перед всеми неправильными),
 * отбрасываются как «дополнение»; из остальных побеждает различающий больше
 * всего вопросов. Токен-маркер сопоставляется по началу префикса — повреждённый
 * глифами токен («=<» при маркере «=») всё равно засчитывается.
 *
 * Подтверждение: победитель должен присутствовать в строгом большинстве
 * вопросов, иначе формат не подтверждён и парсер отклоняет документ.
 *
 * Применение подтверждённого маркера вопросу доверяет:
 * помечены все варианты — значит, все и верны; не помечен ни один — вопрос
 * будет отклонён с причиной `NO_ANSWER_MARKER`.
 */
export function inferAnswerMarkerProfile(
	questions: RawQuestion[],
	evaluationIndices: number[]
): AnswerMarkerProfile | null {
	const styles = questions.map(q => q.options.map(styleOf));
	if (styles.length === 0 || evaluationIndices.length === 0) return null;

	const symbolPrefixes = new Set<string>();
	const colors = new Set<string>();
	for (const questionIndex of evaluationIndices) {
		const qs = styles[questionIndex];
		for (const s of qs) {
			if (s.structuralPrefix && s.hasTextAfterStructuralPrefix) {
				symbolPrefixes.add(s.structuralPrefix);
			}
			if (s.sourcePrefix && s.hasTextAfterSourcePrefix) symbolPrefixes.add(s.sourcePrefix);
			if (s.color) colors.add(s.color);
		}
	}

	const candidates: Candidate[] = [];
	for (const symbolPrefix of symbolPrefixes) {
		const signal: AnswerMarkerSignal = { kind: 'symbol', prefix: symbolPrefix };
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}
	for (const signal of [
		{ kind: 'highlight', floor: 0.08 },
		{ kind: 'bold', threshold: 0.55 },
		{ kind: 'italic', threshold: 0.55 }
	] satisfies AnswerMarkerSignal[]) {
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}
	for (const color of colors) {
		const signal: AnswerMarkerSignal = { kind: 'color', value: color };
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}

	const usable = candidates.filter(c => c.coverage >= 1 && c.avgFraction <= 0.5);
	if (usable.length === 0) return null;

	// Настоящий маркер различает больше всего вопросов; шумовые признаки,
	// зацепившие один-два варианта, отсеиваются.
	const maxCoverage = Math.max(...usable.map(c => c.coverage));
	const top = usable.filter(c => c.coverage === maxCoverage);

	// Формат подтверждён, только если победитель присутствует в большинстве вопросов.
	const bestConforming = Math.max(...top.map(c => c.conforming));
	if (!hasStrictMajority(bestConforming, evaluationIndices.length)) return null;

	// Признаки с одинаковой разметкой не конфликтуют — группируем по ней.
	const signature = (sets: boolean[][]) => sets.map(questionSignature).join(';');
	const variants: Candidate[] = [];
	const seen = new Set<string>();
	for (const c of top) {
		const key = signature(c.sets);
		if (!seen.has(key)) {
			seen.add(key);
			variants.push(c);
		}
	}

	// Где ведущие признаки согласны — берём их разметку как есть (включая «все
	// верны»); где расходятся — вопрос неоднозначен и остаётся без пометок.
	const marked: boolean[][] = [];
	for (let qi = 0; qi < styles.length; qi++) {
		const distinct = new Set(variants.map(variant => questionSignature(variant.sets[qi])));
		if (distinct.size === 1) {
			marked.push(variants[0].sets[qi]);
		} else {
			marked.push(styles[qi].map(() => false));
		}
	}

	// Символьный декоратор может быть немного повреждён и уступить более полному
	// визуальному признаку. Удаляем его из текста, если он подтверждён на нужной
	// доле вопросов и нигде не противоречит итоговой разметке.
	const compatibleSymbolCandidates = usable
		.filter(
			(candidate): candidate is Candidate & { signal: { kind: 'symbol'; prefix: string } } => {
				if (candidate.signal.kind !== 'symbol') return false;
				if (!hasStrictMajority(candidate.conforming, evaluationIndices.length)) return false;

				return candidate.sets.every((question, questionIndex) =>
					question.every((isMarked, optionIndex) => !isMarked || marked[questionIndex][optionIndex])
				);
			}
		)
		.sort(
			(a, b) =>
				b.coverage - a.coverage ||
				a.signal.prefix.length - b.signal.prefix.length ||
				a.signal.prefix.localeCompare(b.signal.prefix)
		);
	const symbolPrefix = compatibleSymbolCandidates[0]?.signal.prefix ?? null;

	return { signals: variants.map(candidate => candidate.signal), symbolPrefix };
}

function confirmedSymbolMarker(
	option: RawOption,
	symbolPrefix: string | null
): { matches: boolean; consumedTextPrefix: string | null } {
	if (
		!symbolPrefix ||
		!option.structuralPrefix ||
		!symbolPrefix.startsWith(option.structuralPrefix)
	) {
		return { matches: false, consumedTextPrefix: null };
	}

	const remainder = symbolPrefix.slice(option.structuralPrefix.length);
	const contiguous = option.sourcePrefix?.startsWith(symbolPrefix) ?? false;
	// Раздельная запись сама профиль не подтверждает. После подтверждения
	// `=+answer` и `= +answer` являются одной формой составного маркера.
	const separatedByWhitespace =
		remainder !== '' &&
		option.sourcePrefix === option.structuralPrefix &&
		option.texts[0]?.startsWith(remainder);
	const matches = contiguous || separatedByWhitespace;

	return {
		matches,
		consumedTextPrefix:
			matches && remainder !== '' && option.texts[0]?.startsWith(remainder) ? remainder : null
	};
}

/** Применяет уже зафиксированный профиль, ничего заново не выбирая. */
export function applyAnswerMarkerProfile(
	question: RawQuestion,
	profile: AnswerMarkerProfile
): AppliedAnswerMarker {
	const styles = [question.options.map(styleOf)];
	const variants = profile.signals.map(signal => markBySignal(styles, signal)[0]);
	const distinct = new Set(variants.map(questionSignature));
	if (distinct.size !== 1) {
		return {
			marked: question.options.map(() => false),
			ambiguous: true,
			consumedTextPrefixes: question.options.map(() => null)
		};
	}

	const marked = [...variants[0]];
	const confirmedSymbols = question.options.map(option =>
		confirmedSymbolMarker(option, profile.symbolPrefix)
	);
	confirmedSymbols.forEach((symbol, optionIndex) => {
		if (symbol.matches) marked[optionIndex] = true;
	});

	return {
		marked,
		ambiguous: false,
		consumedTextPrefixes: confirmedSymbols.map((symbol, optionIndex) =>
			marked[optionIndex] ? symbol.consumedTextPrefix : null
		)
	};
}
