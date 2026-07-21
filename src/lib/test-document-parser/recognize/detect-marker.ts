import { RawOption, RawQuestion } from './segment';

/**
 * Итог поиска указателя ответа. `marked` — разметка правильных вариантов по
 * вопросам (пустая строка = ответ не найден). `ambiguous` — номера вопросов
 * (в пределах переданного списка), где конкурирующие признаки разошлись и
 * уверенно выбрать ответ нельзя. Провала уровня документа больше нет: если
 * указателя нет вовсе, все вопросы просто остаются без пометок.
 */
export interface MarkerResult {
	marked: boolean[][];
	ambiguous: number[];
}

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
 * Кандидат-признак: его разметка, число размеченных вопросов и флаг «в каком-то
 * вопросе помечены сразу все варианты» — такой признак не различает ответы и
 * потому не годится в маркеры.
 */
interface Candidate {
	sets: boolean[][];
	answered: number;
	marksAll: boolean;
}

function toCandidate(sets: boolean[][]): Candidate {
	let answered = 0;
	let marksAll = false;
	for (const qs of sets) {
		const count = qs.filter(Boolean).length;
		if (count >= qs.length) marksAll = true;
		else if (count >= 1) answered++;
	}

	return { sets, answered, marksAll };
}

const questionSignature = (qs: boolean[]) => qs.map(b => (b ? '1' : '0')).join('');

/**
 * Ищет единственный признак, выделяющий правильные ответы на фоне остальных:
 * символьный префикс, цветовое выделение, жирность, курсив или цвет текста.
 *
 * Признак-кандидат годится, если ни в одном вопросе не помечает сразу все
 * варианты (иначе он не различает ответы) и размечает хотя бы один вопрос.
 * Отдельные вопросы он вправе оставить без пометки — это вопросы без ответа,
 * документ из-за них невалидным не становится. Из годных берётся тот, что
 * размечает больше всего вопросов; при двух взаимодополняющих признаках
 * (например, «~» у неправильных и «=» у правильных) — признак меньшинства.
 * `no-answer-marker` возвращается, только если ни один признак не разметил
 * ничего во всём документе.
 */
export function resolveAnswerMarker(questions: RawQuestion[]): MarkerResult {
	const styles = questions.map(q => q.options.map(styleOf));

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
		candidates.push(toCandidate(markByPredicate(styles, s => s.token === token)));
	candidates.push(toCandidate(markByRelativeScore(styles, s => s.highlight, 0.08)));
	candidates.push(toCandidate(markByPredicate(styles, s => s.bold >= 0.55)));
	candidates.push(toCandidate(markByPredicate(styles, s => s.italic >= 0.55)));
	for (const color of colors)
		candidates.push(toCandidate(markByPredicate(styles, s => s.color === color)));

	const unmarked = () => styles.map(qs => qs.map(() => false));

	const usable = candidates.filter(c => !c.marksAll && c.answered >= 1);
	if (usable.length === 0) {
		// Указателя ответа в документе нет — все вопросы остаются без пометок.
		return { marked: unmarked(), ambiguous: [] };
	}

	// Настоящий маркер объясняет больше всего вопросов; шумовые признаки,
	// зацепившие один-два варианта, отсеиваются.
	const maxAnswered = Math.max(...usable.map(c => c.answered));
	const top = usable.filter(c => c.answered === maxAnswered);

	// Признаки с одинаковой разметкой не конфликтуют — группируем по ней.
	const signature = (sets: boolean[][]) => sets.map(questionSignature).join(';');
	const groups = new Map<string, { sets: boolean[][]; total: number }>();
	for (const c of top) {
		const key = signature(c.sets);
		if (!groups.has(key)) {
			groups.set(key, {
				sets: c.sets,
				total: c.sets.reduce((n, qs) => n + qs.filter(Boolean).length, 0)
			});
		}
	}
	if (groups.size === 1) {
		return { marked: [...groups.values()][0].sets, ambiguous: [] };
	}
	if (groups.size === 2) {
		const [a, b] = [...groups.values()];
		const complementary = a.sets.every((set, qi) => set.every((m, oi) => m !== b.sets[qi][oi]));
		if (complementary && a.total !== b.total) {
			return { marked: (a.total < b.total ? a : b).sets, ambiguous: [] };
		}
	}

	// Признаки расходятся: там, где все группы согласны, берём их разметку;
	// где расходятся — вопрос считаем неоднозначным и оставляем без пометок.
	const variants = [...groups.values()].map(g => g.sets);
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

	return { marked, ambiguous };
}
