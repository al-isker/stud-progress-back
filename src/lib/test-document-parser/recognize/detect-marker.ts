import { RawOption, RawQuestion } from './segment';

export type MarkerResult =
	| { marked: boolean[][] }
	| { reason: 'no-answer-marker' | 'ambiguous-answer-marker' };

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
): boolean[][] | null {
	const sets: boolean[][] = [];
	for (const qs of styles) {
		const scores = qs.map(score);
		const max = Math.max(...scores);
		if (max < floor) return null;
		const threshold = Math.max(floor, max * 0.5);
		sets.push(scores.map(v => v >= threshold));
	}

	return sets;
}

/** Каждый вопрос должен помечать хотя бы один, но не все варианты. */
function isSelective(sets: boolean[][]): boolean {
	return sets.every(qs => {
		const count = qs.filter(Boolean).length;

		return count >= 1 && count < qs.length;
	});
}

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

	const candidates: boolean[][][] = [];
	const pushIf = (sets: boolean[][] | null) => {
		if (sets && isSelective(sets)) candidates.push(sets);
	};

	for (const token of tokens) pushIf(markByPredicate(styles, s => s.token === token));
	pushIf(markByRelativeScore(styles, s => s.highlight, 0.08));
	pushIf(markByPredicate(styles, s => s.bold >= 0.55));
	pushIf(markByPredicate(styles, s => s.italic >= 0.55));
	for (const color of colors) pushIf(markByPredicate(styles, s => s.color === color));

	if (candidates.length === 0) return { reason: 'no-answer-marker' };

	// Признаки с одинаковой разметкой не конфликтуют — группируем по ней.
	const signature = (sets: boolean[][]) =>
		sets.map(s => s.map(b => (b ? '1' : '0')).join('')).join(';');
	const groups = new Map<string, { sets: boolean[][]; total: number }>();
	for (const sets of candidates) {
		const key = signature(sets);
		if (!groups.has(key)) {
			groups.set(key, { sets, total: sets.reduce((n, qs) => n + qs.filter(Boolean).length, 0) });
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

	return { reason: 'ambiguous-answer-marker' };
}
