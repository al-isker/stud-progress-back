import type { AnswerMarkerProfile } from './detect-marker';
import { RawOption, RawQuestion } from './segment';

interface ParsedPercentageScore {
	score: number;
	/** Точный фрагмент первой строки варианта, занятый score-маркером. */
	consumedTextPrefix: string;
	hasAnswerText: boolean;
}

interface PercentageSyntaxBase {
	consumedTextPrefixes: (string | null)[];
}

/** Локальная процентная грамматика одного вопроса до применения профиля документа. */
export type PercentageSyntaxAnalysis =
	| (PercentageSyntaxBase & { kind: 'none' })
	| (PercentageSyntaxBase & { kind: 'incomplete'; evidenceIndices: number[] })
	| (PercentageSyntaxBase & { kind: 'unresolved' })
	| (PercentageSyntaxBase & { kind: 'resolved'; marked: boolean[] });

const SCORE_RE = /^%\s*([+-]?)\s*(\d+(?:[.,]\s*\d+)?)\s*%\s*/;
const SCORE_OPEN_RE = /^%\s*[+-]?\s*\d/;

interface ScoreSource {
	text: string;
	/** Число начальных символов score, уже точно потреблённых структурным префиксом. */
	structuralLength: number;
}

/**
 * Возвращает score в том виде, в котором он находился в исходной строке.
 *
 * Сегментация иногда подтверждает `~%` или `%-` целиком как структурный
 * префикс варианта. В таком случае `%` не потерян автором: он присутствует в
 * `structuralPrefix`, поэтому локальная грамматика учитывает именно этот
 * известный фрагмент. Строка `~50% answer` здесь никогда не превращается в
 * `~%50% answer`.
 */
function scoreSource(option: RawOption): ScoreSource {
	const firstText = option.texts[0] ?? '';
	const structuralPrefix = option.structuralPrefix ?? '';
	const percentIndex = structuralPrefix.indexOf('%');
	const structuralScoreHead =
		percentIndex >= 0 && !firstText.trimStart().startsWith('%')
			? structuralPrefix.slice(percentIndex)
			: '';

	return {
		text: structuralScoreHead + firstText,
		structuralLength: structuralScoreHead.length
	};
}

function parsePercentageScore(option: RawOption): ParsedPercentageScore | null {
	const source = scoreSource(option);
	const match = SCORE_RE.exec(source.text);
	if (!match) return null;

	const score = Number(`${match[1]}${match[2].replace(/\s/gu, '').replace(',', '.')}`);
	if (!Number.isFinite(score) || score < -100 || score > 100) return null;

	const consumedTextPrefix = match[0].slice(source.structuralLength);
	const firstText = option.texts[0] ?? '';
	const remainder = firstText.slice(consumedTextPrefix.length).trimStart();
	const hasAnswerText = remainder !== '' || option.texts.slice(1).some(text => text.trim() !== '');

	return { score, consumedTextPrefix, hasAnswerText };
}

function hasPercentageEvidence(option: RawOption): boolean {
	return SCORE_OPEN_RE.test(scoreSource(option).text.trimStart());
}

/**
 * Распознаёт процентную грамматику без догадок и восстановления повреждённых
 * score-маркеров. Вопрос считается полным только тогда, когда каждый вариант
 * содержит корректный `%...%` и непустой текст ответа после него.
 */
export function analyzePercentageSyntax(question: RawQuestion): PercentageSyntaxAnalysis {
	if (question.options.length === 0) return { kind: 'none', consumedTextPrefixes: [] };

	const parsed = question.options.map(parsePercentageScore);
	const evidenceIndices = question.options.flatMap((option, index) =>
		hasPercentageEvidence(option) ? [index] : []
	);
	const consumedTextPrefixes = parsed.map(item => item?.consumedTextPrefix ?? null);
	if (evidenceIndices.length === 0) return { kind: 'none', consumedTextPrefixes };

	if (parsed.some(item => item === null || !item.hasAnswerText)) {
		return { kind: 'incomplete', evidenceIndices, consumedTextPrefixes };
	}

	const scores = parsed.map(item => item.score);
	const max = Math.max(...scores);
	if (max <= 0) return { kind: 'unresolved', consumedTextPrefixes };

	return {
		kind: 'resolved',
		marked: scores.map(score => score === max),
		consumedTextPrefixes
	};
}

/**
 * Единственное исключение из строгой процентной грамматики: `%...` является
 * началом обычного ответа с подтверждённым документным маркером `=`. Все
 * процентные признаки такого вопроса должны находиться именно после `=`.
 */
export function isOrdinaryEqualsQuestion(
	question: RawQuestion,
	analysis: PercentageSyntaxAnalysis,
	answerMarker: AnswerMarkerProfile | null
): boolean {
	return (
		analysis.kind === 'incomplete' &&
		Boolean(answerMarker?.symbolPrefix?.startsWith('=')) &&
		analysis.evidenceIndices.every(index =>
			question.options[index].structuralPrefix?.startsWith('=')
		)
	);
}
