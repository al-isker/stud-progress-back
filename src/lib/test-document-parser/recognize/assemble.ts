import {
	InvalidQuestions,
	InvalidReason,
	ParseResult,
	ParseStatus,
	QuestionRef
} from '../types/parse-result';
import { Question } from '../types/test-document';
import { RawQuestion } from './segment';

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
 * Собирает результат. Пустой текст вопроса или варианта — единственная частная
 * проблема, при которой документ невалиден (извлечь вопрос вообще не удалось).
 * Остальные проблемные вопросы уходят в соответствующий перечень
 * `invalidQuestions` и в `document.questions` не включаются; документ при этом
 * остаётся валидным.
 *
 * @param marks  разметка правильных вариантов по вопросам; `undefined` — вопрос
 *   не участвовал в поиске указателя (у него меньше двух вариантов).
 * @param ambiguous  индексы вопросов (в `raw`) с противоречивым указателем.
 */
export function assembleTestDocument(
	raw: RawQuestion[],
	marks: (boolean[] | undefined)[],
	ambiguous: Set<number>
): ParseResult {
	const questions: Question[] = [];
	const invalidQuestions: InvalidQuestions = {
		withoutOptions: [],
		ambiguousAnswerMarker: [],
		noAnswerMarker: []
	};

	for (let qi = 0; qi < raw.length; qi++) {
		const text = normalize(raw[qi].texts);
		if (!text) {
			return { status: ParseStatus.INVALID, reason: InvalidReason.EMPTY_QUESTION_TEXT };
		}

		const mark = marks[qi];
		const options = raw[qi].options.map((option, oi) => ({
			index: oi + 1,
			text: normalize(option.texts),
			isCorrect: mark ? mark[oi] : false
		}));
		if (options.some(o => !o.text)) {
			return { status: ParseStatus.INVALID, reason: InvalidReason.EMPTY_OPTION_TEXT };
		}

		// Проблемные вопросы уходят в соответствующий перечень и в основной массив
		// document.questions НЕ попадают. index сохраняет позицию в исходном
		// документе, поэтому в document.questions возможны пропуски номеров.
		const ref: QuestionRef = { index: qi + 1, text };
		if (options.length < 2) {
			invalidQuestions.withoutOptions.push(ref);
			continue;
		}
		if (ambiguous.has(qi)) {
			invalidQuestions.ambiguousAnswerMarker.push(ref);
			continue;
		}
		if (!options.some(o => o.isCorrect)) {
			invalidQuestions.noAnswerMarker.push(ref);
			continue;
		}

		const correctCount = options.filter(o => o.isCorrect).length;
		questions.push({
			index: qi + 1,
			text,
			type: correctCount >= 2 ? 'multiple' : 'single',
			options
		});
	}

	return { status: ParseStatus.VALID, document: { questions }, invalidQuestions };
}
