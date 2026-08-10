import { RawOption, RawQuestion } from './segment';

interface ParsedPercentageScore {
	score: number;
	/** Точный префикс первой строки варианта, который является служебным score. */
	consumedTextPrefix: string;
	hasAnswerText: boolean;
	hasNestedMarker: boolean;
}

export type PercentageMarkerResult =
	| { recognized: false }
	| { recognized: true; resolved: false }
	| {
			recognized: true;
			resolved: true;
			marked: boolean[];
			consumedTextPrefixes: (string | null)[];
	  };

const SCORE_RE = /^%\s*([+-]?)\s*(\d+(?:[.,]\s*\d+)?)\s*%\s*/;
const NESTED_SCORE_RE = /^~?\s*%\s*[+-]?\s*\d+(?:[.,]\s*\d+)?\s*%/;

function scoreText(option: RawOption): { text: string; restoredLeadingPercent: boolean } {
	const firstText = option.texts[0] ?? '';
	const restoredLeadingPercent =
		!firstText.startsWith('%') && option.structuralPrefix?.endsWith('%');

	return {
		text: restoredLeadingPercent ? `%${firstText}` : firstText,
		restoredLeadingPercent: Boolean(restoredLeadingPercent)
	};
}

function looksLikePercentageScore(option: RawOption): boolean {
	return scoreText(option).text.trimStart().startsWith('%');
}

/**
 * Читает score только непосредственно после символьного префикса варианта.
 * Дополнительные проценты внутри ответа (`0,9% раствор`, `60–80%`) не участвуют.
 *
 * После удаления структурного префикса score имеет форму `%50%`/`%-50%`.
 * Начальный `%` отличает служебную грамматику экспорта от обычного ответа
 * `~1% раствор` и позволяет поддержать как `~%50%`, так и `~ %50%`.
 */
function parsePercentageScore(option: RawOption): ParsedPercentageScore | null {
	const firstText = option.texts[0] ?? '';
	const candidate = scoreText(option);
	const match = SCORE_RE.exec(candidate.text);
	if (!match) return null;
	const score = Number(`${match[1]}${match[2].replace(/\s/gu, '').replace(',', '.')}`);
	if (!Number.isFinite(score) || score < -100 || score > 100) return null;

	const consumedTextPrefix = candidate.restoredLeadingPercent ? match[0].slice(1) : match[0];
	const remainder = firstText.slice(consumedTextPrefix.length).trimStart();
	const hasAnswerText = remainder !== '' || option.texts.slice(1).some(text => text.trim() !== '');

	return {
		score,
		consumedTextPrefix,
		hasAnswerText,
		hasNestedMarker: remainder.startsWith('~') || NESTED_SCORE_RE.test(remainder)
	};
}

/** Служебные score-префиксы отделены от решения о правильности вариантов. */
export function percentageTextPrefixes(question: RawQuestion): (string | null)[] {
	return question.options.map(option => parsePercentageScore(option)?.consumedTextPrefix ?? null);
}

/**
 * Распознаёт локальный процентный маркер одного вопроса.
 *
 * Декорированные варианты содержат явный score, обычные `~`-варианты получают
 * нулевой вес. Если встречается недекорированный `=`-вариант, локальная стратегия
 * не перехватывает вопрос: его должен разобрать глобальный символьный маркер.
 * Единственный положительный максимум образует single-вопрос, несколько вариантов
 * с одинаковым положительным максимумом — multiple. Максимум у всех вариантов
 * означает, что все они правильные.
 */
export function resolvePercentageMarker(question: RawQuestion): PercentageMarkerResult {
	if (question.options.length < 2) return { recognized: false };
	const parsed = question.options.map(parsePercentageScore);
	const scoreLike = question.options.map(looksLikePercentageScore);
	if (parsed.every(score => score === null) && scoreLike.every(value => !value)) {
		return { recognized: false };
	}
	// У обычного GIFT-вопроса ответ вполне может начинаться с `%` (например,
	// `=%`). Неразмеченный `=` — более сильный структурный сигнал: такой вопрос
	// должен разбирать глобальный маркер документа, а не процентная грамматика.
	if (
		question.options.some(
			(option, index) => parsed[index] === null && option.structuralPrefix?.startsWith('=')
		)
	) {
		return { recognized: false };
	}
	if (
		parsed.some((score, index) => scoreLike[index] && score === null) ||
		parsed.some(score => score && (!score.hasAnswerText || score.hasNestedMarker))
	) {
		return { recognized: true, resolved: false };
	}

	const scores = parsed.map(item => item?.score ?? 0);
	const max = Math.max(...scores);
	const marked = scores.map(score => score === max);
	if (max <= 0) {
		return { recognized: true, resolved: false };
	}

	return {
		recognized: true,
		resolved: true,
		marked,
		consumedTextPrefixes: parsed.map(item => item?.consumedTextPrefix ?? null)
	};
}
