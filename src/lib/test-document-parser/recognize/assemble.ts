import {
	ParseResult,
	ParseStatus,
	QuestionRejectionReason,
	RejectedQuestion
} from '../types/parse-result';
import { Question } from '../types/test-document';
import { RawOption, RawQuestion } from './segment';

/**
 * Склеивает строки варианта/вопроса. Только мягкий перенос `U+00AD` является
 * однозначным указанием объединить части слова без дефиса. Любая видимая
 * чёрточка сохраняется; в остальных случаях строки разделяются пробелом.
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
		if (out.endsWith('\u00ad')) {
			out = out.slice(0, -1) + part;
		} else if (/[-‐‑]$/.test(out)) {
			const separated = /\s[-‐‑]$/.test(out);
			out += separated && !/^\d/.test(part) ? ` ${part}` : part;
		} else if (/^[-‐‑](?=\p{L})/u.test(part)) {
			// Видимая чёрточка является частью авторского текста.
			out += part;
		} else {
			out += ` ${part}`;
		}
	}

	return out.replace(/\s+/g, ' ').trim();
}

/**
 * Удаляет из первой строки только точный служебный префикс, подтверждённый
 * выбранной стратегией маркера. Остальные начальные символы являются частью
 * ответа (`=%` → `%`, если `%` не был подтверждён как маркер).
 */
function optionTextParts(option: RawOption, consumedTextPrefix: string | null): string[] {
	const parts = [...option.texts];
	if (consumedTextPrefix && parts[0]?.startsWith(consumedTextPrefix)) {
		parts[0] = parts[0].slice(consumedTextPrefix.length).trimStart();
	}

	return parts;
}

/**
 * Собирает принятый документ: вопросы с пустым текстом, малым количеством
 * вариантов, противоречивым или ненайденным указателем уходят в
 * массив `issues.rejectedQuestions` и в `document.questions` НЕ
 * включаются. Мы ничего не «нормализуем» — как извлечено, так и раскладываем.
 * index сохраняет позицию в исходном документе, поэтому в `document.questions`
 * возможны пропуски номеров.
 *
 * @param marks  разметка правильных вариантов по вопросам; `undefined` — вопрос
 *   не участвовал в поиске указателя (у него меньше двух вариантов).
 * @param ambiguous  индексы вопросов (в `raw`) с противоречивым указателем.
 * @param consumedTextPrefixes  служебные префиксы текста по вариантам.
 */
export function assembleTestDocument(
	raw: RawQuestion[],
	marks: (boolean[] | undefined)[],
	ambiguous: Set<number>,
	consumedTextPrefixes: ((string | null)[] | undefined)[] = []
): ParseResult {
	const questions: Question[] = [];
	const rejectedQuestions: RejectedQuestion[] = [];

	for (let qi = 0; qi < raw.length; qi++) {
		const text = normalize(raw[qi].texts);
		const mark = marks[qi];
		const options = raw[qi].options.map((option, oi) => ({
			index: oi + 1,
			text: normalize(optionTextParts(option, consumedTextPrefixes[qi]?.[oi] ?? null)),
			isCorrect: mark ? mark[oi] : false
		}));

		const rejectQuestion = (reason: QuestionRejectionReason) => {
			rejectedQuestions.push({ index: qi + 1, text, reason });
		};

		if (raw[qi].rejectionReason) {
			rejectQuestion(raw[qi].rejectionReason);
			continue;
		}
		if (!text || options.some(o => !o.text)) {
			rejectQuestion(QuestionRejectionReason.EMPTY_TEXT);
			continue;
		}
		if (options.length < 2) {
			rejectQuestion(QuestionRejectionReason.INSUFFICIENT_OPTIONS);
			continue;
		}
		if (ambiguous.has(qi)) {
			rejectQuestion(QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER);
			continue;
		}
		if (!options.some(o => o.isCorrect)) {
			rejectQuestion(QuestionRejectionReason.NO_ANSWER_MARKER);
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

	return {
		status: ParseStatus.ACCEPTED,
		document: { questions },
		issues: { rejectedQuestions }
	};
}
