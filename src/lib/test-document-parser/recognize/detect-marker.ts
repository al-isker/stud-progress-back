import { percentageTextPrefixes, resolvePercentageMarker } from './detect-percentage-marker';
import { hasMatchingMarkerPattern, isMatchingCandidate } from './matching';
import { RawOption, RawQuestion } from './segment';

/**
 * Итог поиска указателя ответа.
 *
 * `confirmed: true` — поддерживаемые стратегии совместно покрывают строгое
 * большинство вопросов. `marked` — разметка правильных вариантов,
 * `consumedTextPrefixes` — точные служебные префиксы, удаляемые из текста,
 * `ambiguous` — номера вопросов, где глобальные признаки разошлись.
 *
 * `confirmed: false` — поддерживаемые форматы не покрывают большинство;
 * парсер отклоняет документ целиком.
 */
export type MarkerResult =
	| {
			confirmed: true;
			marked: boolean[][];
			matching: boolean[];
			ambiguous: number[];
			consumedTextPrefixes: (string | null)[][];
	  }
	| { confirmed: false };

type GlobalMarkerResult =
	| {
			confirmed: true;
			marked: boolean[][];
			ambiguous: number[];
			symbolPrefix: string | null;
	  }
	| { confirmed: false };

/** Ровно половины недостаточно: формат подтверждает только строгое большинство. */
const hasStrictMajority = (count: number, total: number) => count > total / 2;

/** Агрегированные визуальные свойства варианта (по всем его строкам). */
interface OptionStyle {
	sourcePrefix: string | null;
	hasTextAfterSourcePrefix: boolean;
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
		hasTextAfterSourcePrefix: option.hasTextAfterSourcePrefix,
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
	/** Символьный маркер для кандидата; null у визуальных признаков. */
	symbolPrefix: string | null;
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
	symbolPrefix: string | null = null
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
		symbolPrefix,
		coverage,
		conforming,
		avgFraction: coverage > 0 ? fractionSum / coverage : 1
	};
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
function resolveGlobalAnswerMarker(
	questions: RawQuestion[],
	evaluationIndices: number[]
): GlobalMarkerResult {
	const styles = questions.map(q => q.options.map(styleOf));
	if (styles.length === 0 || evaluationIndices.length === 0) return { confirmed: false };

	const symbolPrefixes = new Set<string>();
	const colors = new Set<string>();
	for (const questionIndex of evaluationIndices) {
		const qs = styles[questionIndex];
		for (const s of qs) {
			if (s.sourcePrefix && s.hasTextAfterSourcePrefix) symbolPrefixes.add(s.sourcePrefix);
			if (s.color) colors.add(s.color);
		}
	}

	const candidates: Candidate[] = [];
	for (const symbolPrefix of symbolPrefixes)
		candidates.push(
			toCandidate(
				markByPredicate(
					styles,
					s => s.sourcePrefix !== null && s.sourcePrefix.startsWith(symbolPrefix)
				),
				evaluationIndices,
				symbolPrefix
			)
		);
	candidates.push(
		toCandidate(
			markByRelativeScore(styles, s => s.highlight, 0.08),
			evaluationIndices
		)
	);
	candidates.push(
		toCandidate(
			markByPredicate(styles, s => s.bold >= 0.55),
			evaluationIndices
		)
	);
	candidates.push(
		toCandidate(
			markByPredicate(styles, s => s.italic >= 0.55),
			evaluationIndices
		)
	);
	for (const color of colors)
		candidates.push(
			toCandidate(
				markByPredicate(styles, s => s.color === color),
				evaluationIndices
			)
		);

	const usable = candidates.filter(c => c.coverage >= 1 && c.avgFraction <= 0.5);
	if (usable.length === 0) return { confirmed: false };

	// Настоящий маркер различает больше всего вопросов; шумовые признаки,
	// зацепившие один-два варианта, отсеиваются.
	const maxCoverage = Math.max(...usable.map(c => c.coverage));
	const top = usable.filter(c => c.coverage === maxCoverage);

	// Формат подтверждён, только если победитель присутствует в большинстве вопросов.
	const bestConforming = Math.max(...top.map(c => c.conforming));
	if (!hasStrictMajority(bestConforming, evaluationIndices.length)) return { confirmed: false };

	// Признаки с одинаковой разметкой не конфликтуют — группируем по ней.
	const signature = (sets: boolean[][]) => sets.map(questionSignature).join(';');
	const variants: boolean[][][] = [];
	const seen = new Set<string>();
	for (const c of top) {
		const key = signature(c.sets);
		if (!seen.has(key)) {
			seen.add(key);
			variants.push(c.sets);
		}
	}

	// Где ведущие признаки согласны — берём их разметку как есть (включая «все
	// верны»); где расходятся — вопрос неоднозначен и остаётся без пометок.
	const marked: boolean[][] = [];
	const ambiguous: number[] = [];
	for (let qi = 0; qi < styles.length; qi++) {
		const distinct = new Set(variants.map(v => questionSignature(v[qi])));
		if (distinct.size === 1) {
			marked.push(variants[0][qi]);
		} else {
			marked.push(styles[qi].map(() => false));
			ambiguous.push(qi);
		}
	}

	// Символьный декоратор может быть немного повреждён и уступить более полному
	// визуальному признаку. Удаляем его из текста, если он подтверждён на нужной
	// доле вопросов и нигде не противоречит итоговой разметке.
	const compatibleSymbolCandidates = usable
		.filter((candidate): candidate is Candidate & { symbolPrefix: string } => {
			if (!candidate.symbolPrefix) return false;
			if (!hasStrictMajority(candidate.conforming, evaluationIndices.length)) return false;

			return candidate.sets.every((question, questionIndex) =>
				question.every((isMarked, optionIndex) => !isMarked || marked[questionIndex][optionIndex])
			);
		})
		.sort(
			(a, b) =>
				b.coverage - a.coverage ||
				a.symbolPrefix.length - b.symbolPrefix.length ||
				a.symbolPrefix.localeCompare(b.symbolPrefix)
		);
	const symbolPrefix = compatibleSymbolCandidates[0]?.symbolPrefix ?? null;

	return { confirmed: true, marked, ambiguous, symbolPrefix };
}

function consumedSymbolPrefixes(
	questions: RawQuestion[],
	symbolPrefix: string | null,
	marked: boolean[][]
): (string | null)[][] {
	return questions.map((question, questionIndex) =>
		question.options.map((option, optionIndex) => {
			if (
				!marked[questionIndex][optionIndex] ||
				!symbolPrefix ||
				!option.structuralPrefix ||
				!symbolPrefix.startsWith(option.structuralPrefix)
			) {
				return null;
			}

			const remainder = symbolPrefix.slice(option.structuralPrefix.length);
			const contiguous = option.sourcePrefix?.startsWith(symbolPrefix);
			const separatedByWhitespace = option.sourcePrefix === option.structuralPrefix;

			return remainder !== '' &&
				(contiguous || separatedByWhitespace) &&
				option.texts[0]?.startsWith(remainder)
				? remainder
				: null;
		})
	);
}

/**
 * После подтверждения составного маркера на документе допускает пробел между
 * его структурной и ответной частями (`=+ответ` и `= +ответ`). Раздельная
 * запись сама не участвует в выборе маркера и потому не может его подтвердить.
 */
function applySeparatedCompoundMarker(
	questions: RawQuestion[],
	marked: boolean[][],
	ambiguous: number[],
	symbolPrefix: string | null
): void {
	if (!symbolPrefix) return;
	const ambiguousSet = new Set(ambiguous);
	questions.forEach((question, questionIndex) => {
		if (ambiguousSet.has(questionIndex)) return;
		question.options.forEach((option, optionIndex) => {
			if (
				!option.structuralPrefix ||
				option.sourcePrefix !== option.structuralPrefix ||
				!symbolPrefix.startsWith(option.structuralPrefix)
			) {
				return;
			}
			const remainder = symbolPrefix.slice(option.structuralPrefix.length);
			if (remainder !== '' && option.texts[0]?.startsWith(remainder)) {
				marked[questionIndex][optionIndex] = true;
			}
		});
	});
}

/**
 * Кандидаты в matching не участвуют в выборе глобального маркера, но выбранный
 * по обычным вопросам маркер применяется и к ним. После этого matching
 * подтверждается только при состоянии ALL или NONE; состояние PARTIAL оставляет
 * вопрос обычным. Локальные процентные грамматики не участвуют в выборе
 * глобального признака.
 */
export function resolveAnswerMarker(questions: RawQuestion[]): MarkerResult {
	if (questions.length === 0) return { confirmed: false };

	const percentageResults = questions.map(resolvePercentageMarker);
	const matchingCandidates = questions.map(isMatchingCandidate);
	const marked = questions.map(question => question.options.map(() => false));
	const consumedTextPrefixes: (string | null)[][] = questions.map(percentageTextPrefixes);
	const ambiguous: number[] = [];
	const resolved = questions.map(() => false);

	const globalIndices: number[] = [];
	percentageResults.forEach((result, questionIndex) => {
		if (!result.recognized) {
			globalIndices.push(questionIndex);
			return;
		}
		if (!result.resolved) return;

		marked[questionIndex] = result.marked;
		consumedTextPrefixes[questionIndex] = result.consumedTextPrefixes;
		resolved[questionIndex] = true;
	});

	if (globalIndices.length > 0) {
		const globalQuestions = globalIndices.map(index => questions[index]);
		const evaluationIndices = globalIndices
			.map((questionIndex, localIndex) => ({ questionIndex, localIndex }))
			.filter(({ questionIndex }) => !matchingCandidates[questionIndex])
			.map(({ localIndex }) => localIndex);
		const global = resolveGlobalAnswerMarker(globalQuestions, evaluationIndices);
		if (global.confirmed) {
			applySeparatedCompoundMarker(
				globalQuestions,
				global.marked,
				global.ambiguous,
				global.symbolPrefix
			);
			const globalConsumedPrefixes = consumedSymbolPrefixes(
				globalQuestions,
				global.symbolPrefix,
				global.marked
			);
			globalIndices.forEach((questionIndex, localIndex) => {
				marked[questionIndex] = global.marked[localIndex];
				consumedTextPrefixes[questionIndex] = globalConsumedPrefixes[localIndex].map(
					(prefix, optionIndex) => {
						const percentagePrefix = consumedTextPrefixes[questionIndex][optionIndex];
						if (!prefix) return percentagePrefix;
						if (!percentagePrefix) return prefix;

						return prefix.length >= percentagePrefix.length ? prefix : percentagePrefix;
					}
				);
				resolved[questionIndex] = true;
			});
			ambiguous.push(...global.ambiguous.map(localIndex => globalIndices[localIndex]));
		}
	}

	const ambiguousSet = new Set(ambiguous);
	const matching = questions.map(
		(_, questionIndex) =>
			matchingCandidates[questionIndex] &&
			!ambiguousSet.has(questionIndex) &&
			hasMatchingMarkerPattern(marked[questionIndex])
	);
	matching.forEach((isMatching, questionIndex) => {
		if (isMatching) resolved[questionIndex] = true;
	});

	if (!hasStrictMajority(resolved.filter(Boolean).length, questions.length)) {
		return { confirmed: false };
	}

	return { confirmed: true, marked, matching, ambiguous, consumedTextPrefixes };
}
