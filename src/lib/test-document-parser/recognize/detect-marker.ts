import { RawOption, RawQuestion } from './segment';

export type MarkerResult =
	| { marked: boolean[][] }
	| { reason: 'no-answer-marker' | 'ambiguous-answer-marker'; questions: number[] };

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

/** Кандидат-признак: его разметка и номера вопросов, где он неселективен. */
interface Candidate {
	sets: boolean[][];
	badQuestions: number[];
}

/** Вопрос «плохой», если признак не выделил в нём ни одного или сразу все варианты. */
function toCandidate(sets: boolean[][]): Candidate {
	const badQuestions: number[] = [];
	sets.forEach((qs, i) => {
		const count = qs.filter(Boolean).length;
		if (count < 1 || count >= qs.length) badQuestions.push(i);
	});

	return { sets, badQuestions };
}

const questionSignature = (qs: boolean[]) => qs.map(b => (b ? '1' : '0')).join('');

/**
 * Ищет признак, выделяющий правильные ответы на фоне остальных: символьный
 * префикс, цветовое выделение, жирность, курсив или цвет текста.
 *
 * Признак валиден, если в каждом вопросе он помечает хотя бы один, но не все
 * варианты. При двух взаимодополняющих признаках (например, «~» у неправильных
 * и «=» у правильных) выбирается признак меньшинства — маркер по смыслу
 * выделяет исключение, а не фон.
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

	const valid = candidates.filter(c => c.badQuestions.length === 0);

	if (valid.length === 0) {
		// Ни один признак не размечает все вопросы. Виновники — вопросы, где не
		// сработал ближайший к рабочему признак (с наименьшим числом провалов).
		const best = candidates.reduce((a, b) =>
			b.badQuestions.length < a.badQuestions.length ? b : a
		);

		return { reason: 'no-answer-marker', questions: best.badQuestions };
	}

	// Признаки с одинаковой разметкой не конфликтуют — группируем по ней.
	const signature = (sets: boolean[][]) => sets.map(questionSignature).join(';');
	const groups = new Map<string, { sets: boolean[][]; total: number }>();
	for (const c of valid) {
		const key = signature(c.sets);
		if (!groups.has(key)) {
			groups.set(key, {
				sets: c.sets,
				total: c.sets.reduce((n, qs) => n + qs.filter(Boolean).length, 0)
			});
		}
	}
	if (groups.size === 1) {
		return { marked: [...groups.values()][0].sets };
	}
	if (groups.size === 2) {
		const [a, b] = [...groups.values()];
		const complementary = a.sets.every((set, qi) => set.every((m, oi) => m !== b.sets[qi][oi]));
		if (complementary && a.total !== b.total) {
			return { marked: (a.total < b.total ? a : b).sets };
		}
	}

	// Признаки расходятся — виновники это вопросы, где разметка неодинакова.
	const variants = [...groups.values()].map(g => g.sets);
	const questionsOut: number[] = [];
	for (let qi = 0; qi < styles.length; qi++) {
		const distinct = new Set(variants.map(v => questionSignature(v[qi])));
		if (distinct.size > 1) questionsOut.push(qi);
	}

	return { reason: 'ambiguous-answer-marker', questions: questionsOut };
}
