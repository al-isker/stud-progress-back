import { InvalidReason, ParseResult, ParseStatus, QuestionRef } from '../types/parse-result';
import { Question } from '../types/test-document';
import { RawQuestion } from './segment';

export { normalize as normalizeText };

/**
 * Склеивает строки варианта/вопроса. На переносе (строка кончается дефисом)
 * пробел не ставится, а дефис убирается — если это не составное слово: дефис
 * сохраняется после соединительной гласной («лечебно-…») или перед заглавной/
 * цифрой. В остальных случаях строки разделяются пробелом.
 */
function normalize(parts: string[]): string {
	let out = '';
	for (const raw of parts) {
		const part = raw.trim();
		if (part === '') continue;
		if (out === '') {
			out = part;
			continue;
		}
		if (/[-‐]$/.test(out)) {
			const core = out.replace(/[-‐]+$/, '');
			const keepHyphen = /[оеОЕ]$/.test(core) || /^[A-ZА-ЯЁ0-9]/.test(part);
			out = keepHyphen ? `${core}-${part}` : core + part;
		} else {
			out += ` ${part}`;
		}
	}

	return out.replace(/\s+/g, ' ').trim();
}

/**
 * Строгая сборка результата. Пустые тексты делают документ невалидным. Вопрос,
 * у которого не отмечен ни один правильный вариант, остаётся в документе, но
 * попадает в `unansweredQuestions` — документ из-за него невалидным не станет.
 */
export function assembleTestDocument(raw: RawQuestion[], marked: boolean[][]): ParseResult {
	const questions: Question[] = [];
	const unansweredQuestions: QuestionRef[] = [];

	for (let qi = 0; qi < raw.length; qi++) {
		const text = normalize(raw[qi].texts);
		if (!text) {
			return {
				status: ParseStatus.INVALID,
				reason: InvalidReason.EMPTY_QUESTION_TEXT,
				invalidQuestions: [{ index: qi + 1, text }]
			};
		}

		const options = raw[qi].options.map((option, oi) => ({
			index: oi + 1,
			text: normalize(option.texts),
			isCorrect: marked[qi][oi]
		}));
		if (options.some(o => !o.text)) {
			return {
				status: ParseStatus.INVALID,
				reason: InvalidReason.EMPTY_OPTION_TEXT,
				invalidQuestions: [{ index: qi + 1, text }]
			};
		}

		const correctCount = options.filter(o => o.isCorrect).length;
		if (correctCount === 0) unansweredQuestions.push({ index: qi + 1, text });

		questions.push({
			index: qi + 1,
			text,
			type: correctCount >= 2 ? 'multiple' : 'single',
			options
		});
	}

	return { status: ParseStatus.VALID, document: { questions }, unansweredQuestions };
}
