import { RawOption, RawQuestion } from './segment';

interface ParsedPercentageScore {
	score: number;
	/** Точный префикс первой строки варианта, который является служебным score. */
	consumedTextPrefix: string;
}

export type PercentageMarkerResult =
	| { recognized: false }
	| { recognized: true; resolved: false }
	| {
			recognized: true;
			resolved: true;
			marked: boolean[];
			consumedTextPrefixes: string[];
	  };

const SCORE_RE = /^(\d+(?:[.,]\d+)?)\s*%\s*/;

/**
 * Читает score только непосредственно после символьного префикса варианта.
 * Дополнительные проценты внутри ответа (`0,9% раствор`, `60–80%`) не участвуют.
 *
 * Символ `%` обязан входить в исходный символьный префикс (`~%50%...`). Это
 * отличает служебную грамматику экспорта от обычного ответа `~1% раствор`.
 */
function parsePercentageScore(option: RawOption): ParsedPercentageScore | null {
	if (!option.sourcePrefix?.includes('%')) return null;

	const structuralPrefix = option.structuralPrefix ?? '';
	if (!option.sourcePrefix.startsWith(structuralPrefix)) return null;
	const residualPrefix = option.sourcePrefix.slice(structuralPrefix.length);
	const firstText = option.texts[0] ?? '';
	if (!firstText.startsWith(residualPrefix)) return null;

	const match = SCORE_RE.exec(firstText.slice(residualPrefix.length));
	if (!match) return null;
	const score = Number(match[1].replace(',', '.'));
	if (!Number.isFinite(score) || score < 0 || score > 100) return null;

	const consumedTextPrefix = residualPrefix + match[0];
	const hasAnswerText =
		firstText.slice(consumedTextPrefix.length).trim() !== '' ||
		option.texts.slice(1).some(text => text.trim() !== '');
	if (!hasAnswerText) return null;

	return { score, consumedTextPrefix };
}

/**
 * Распознаёт локальный процентный маркер одного вопроса.
 *
 * Грамматика считается распознанной, только если score есть у каждого варианта.
 * Она разрешается в ответ только для multiple-вопроса: максимальный score должны
 * разделять как минимум два, но не все варианты. Неразрешённая процентная
 * грамматика не должна ошибочно участвовать в поиске глобального маркера.
 */
export function resolvePercentageMarker(question: RawQuestion): PercentageMarkerResult {
	if (question.options.length < 2) return { recognized: false };
	const parsed: ParsedPercentageScore[] = [];
	for (const option of question.options) {
		const score = parsePercentageScore(option);
		if (!score) return { recognized: false };
		parsed.push(score);
	}

	const scores = parsed.map(item => item.score);
	const max = Math.max(...scores);
	const marked = scores.map(score => score === max);
	const markedCount = marked.filter(Boolean).length;
	if (markedCount < 2 || markedCount === marked.length) {
		return { recognized: true, resolved: false };
	}

	return {
		recognized: true,
		resolved: true,
		marked,
		consumedTextPrefixes: parsed.map(item => item.consumedTextPrefix)
	};
}
