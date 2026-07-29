import { RawOption, RawQuestion } from './segment';

/**
 * Итог поиска указателя ответа.
 *
 * `confirmed: true` — формат документа подтверждён: один признак размечает не
 * менее FORMAT_CONFIRMATION_SHARE вопросов. `marked` — разметка правильных
 * вариантов (в том числе «все варианты верны»; пустая разметка = ответ не
 * найден), `ambiguous` — номера вопросов, где конкурирующие признаки разошлись.
 *
 * `confirmed: false` — единый формат указателя не подтверждён; документ
 * целиком считается невалидным.
 */
export type MarkerResult =
	| { confirmed: true; marked: boolean[][]; ambiguous: number[] }
	| { confirmed: false };

/** Минимальная доля вопросов, размеченных одним признаком, для подтверждения формата. */
const FORMAT_CONFIRMATION_SHARE = 0.8;

/** Агрегированные визуальные свойства варианта (по всем его строкам). */
interface OptionStyle {
	token: string | null;
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
		token: option.token,
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
	/** Число вопросов, где признак различает ответ (помечено 1..n-1 вариантов). */
	coverage: number;
	/** Число вопросов, где признак присутствует (помечен хотя бы один вариант). */
	conforming: number;
	/** Средняя доля помеченных вариантов среди различённых вопросов. */
	avgFraction: number;
}

function toCandidate(sets: boolean[][]): Candidate {
	let coverage = 0;
	let conforming = 0;
	let fractionSum = 0;
	for (const qs of sets) {
		const count = qs.filter(Boolean).length;
		if (count >= 1) conforming++;
		if (count >= 1 && count < qs.length) {
			coverage++;
			fractionSum += count / qs.length;
		}
	}

	return { sets, coverage, conforming, avgFraction: coverage > 0 ? fractionSum / coverage : 1 };
}

const questionSignature = (qs: boolean[]) => qs.map(b => (b ? '1' : '0')).join('');

/**
 * Ищет единственный признак, выделяющий правильные ответы на фоне остальных:
 * символьный префикс, цветовое выделение, жирность, курсив или цвет текста.
 * Формат один на весь документ, поэтому сначала признак ПОДТВЕРЖДАЕТСЯ на всём
 * файле, а уже потом применяется к каждому вопросу.
 *
 * Отбор: маркер выделяет меньшинство вариантов, поэтому признаки, в среднем
 * помечающие больше половины (например «~» перед всеми неправильными),
 * отбрасываются как «дополнение»; из остальных побеждает различающий больше
 * всего вопросов. Токен-маркер сопоставляется по началу префикса — повреждённый
 * глифами токен («=<» при маркере «=») всё равно засчитывается.
 *
 * Подтверждение: победитель должен присутствовать не менее чем в
 * FORMAT_CONFIRMATION_SHARE вопросов, иначе формат не подтверждён и документ
 * невалиден.
 *
 * Применение подтверждённого маркера вопросу доверяет:
 * помечены все варианты — значит, все и верны; не помечен ни один — у вопроса
 * нет ответа (уйдёт в noAnswerMarker).
 */
export function resolveAnswerMarker(questions: RawQuestion[]): MarkerResult {
	const styles = questions.map(q => q.options.map(styleOf));
	if (styles.length === 0) return { confirmed: false };

	const tokens = new Set<string>();
	const colors = new Set<string>();
	for (const qs of styles) {
		for (const s of qs) {
			if (s.token) tokens.add(s.token);
			if (s.color) colors.add(s.color);
		}
	}

	const candidates: Candidate[] = [];
	for (const token of tokens)
		candidates.push(
			toCandidate(markByPredicate(styles, s => s.token !== null && s.token.startsWith(token)))
		);
	candidates.push(toCandidate(markByRelativeScore(styles, s => s.highlight, 0.08)));
	candidates.push(toCandidate(markByPredicate(styles, s => s.bold >= 0.55)));
	candidates.push(toCandidate(markByPredicate(styles, s => s.italic >= 0.55)));
	for (const color of colors)
		candidates.push(toCandidate(markByPredicate(styles, s => s.color === color)));

	const usable = candidates.filter(c => c.coverage >= 1 && c.avgFraction <= 0.5);
	if (usable.length === 0) return { confirmed: false };

	// Настоящий маркер различает больше всего вопросов; шумовые признаки,
	// зацепившие один-два варианта, отсеиваются.
	const maxCoverage = Math.max(...usable.map(c => c.coverage));
	const top = usable.filter(c => c.coverage === maxCoverage);

	// Формат подтверждён, только если победитель присутствует в нужной доле вопросов.
	const bestConforming = Math.max(...top.map(c => c.conforming));
	if (bestConforming < styles.length * FORMAT_CONFIRMATION_SHARE) return { confirmed: false };

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

	return { confirmed: true, marked, ambiguous };
}
