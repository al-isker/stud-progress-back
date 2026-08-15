import {
	ParseResult,
	ParseStatus,
	QuestionRejectionReason,
	RejectedQuestion
} from '../types/parse-result';
import { Question } from '../types/test-document';
import { parseMatchingPairs } from './matching';
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

const MACHINE_METADATA_RE = /(?:^|\s)@MDID\s*\{[0-9A-F-]+\}/iu;

function containsMachineMetadata(question: RawQuestion): boolean {
	return [...question.texts, ...question.options.flatMap(option => option.texts)].some(part =>
		MACHINE_METADATA_RE.test(part)
	);
}

function containsDuplicatedTwoPrefixSyntax(
	question: RawQuestion,
	questionText: string,
	consumedTextPrefixes: (string | null)[]
): boolean {
	if (!questionText.startsWith('?')) return false;
	const duplicatedOptions = question.options.filter((option, index) => {
		if (!option.structuralPrefix) return false;
		const text = normalize(optionTextParts(option, consumedTextPrefixes[index] ?? null));

		return text.startsWith(option.structuralPrefix);
	}).length;

	return duplicatedOptions >= 2;
}

function containsDuplicateOptions(options: { text: string }[]): boolean {
	const normalized = options.map(option => option.text.toLocaleLowerCase());

	return new Set(normalized).size !== normalized.length;
}

/**
 * `+` перед текстом является синтаксисом ответа, а не частью содержания, если
 * документ уже подтверждён другим маркером. Подтверждённый `+` к этому моменту
 * удалён через consumedTextPrefix; числовые знаки и последовательности знаков
 * остаются авторским текстом.
 */
function containsConflictingAnswerMarker(
	question: RawQuestion,
	consumedTextPrefixes: (string | null)[]
): boolean {
	return question.options.some((option, optionIndex) => {
		const text = normalize(optionTextParts(option, consumedTextPrefixes[optionIndex] ?? null));

		return /^\+\s*\p{L}/u.test(text);
	});
}

function containsOptionSyntaxInQuestionText(question: RawQuestion): boolean {
	const structuralPrefixes = new Set(
		question.options
			.map(option => option.structuralPrefix)
			.filter((prefix): prefix is string => Boolean(prefix))
	);
	const prefixed = question.texts.map(text =>
		[...structuralPrefixes].some(prefix => text.trimStart().startsWith(prefix))
	);
	for (let start = 0; start < prefixed.length; start++) {
		if (!prefixed[start]) continue;
		let end = start;
		while (end + 1 < prefixed.length && prefixed[end + 1]) end++;
		const followedByQuestionText = prefixed.slice(end + 1).some(value => !value);
		if (followedByQuestionText && (start === 0 || end - start + 1 >= 2)) return true;
		start = end;
	}

	return false;
}

/**
 * Собирает принятый документ. Matching-вопросы не требуют указателя правильного
 * ответа; остальные вопросы с пустым текстом, малым количеством вариантов,
 * противоречивым или ненайденным указателем уходят в
 * массив `issues.rejectedQuestions` и в `document.questions` НЕ
 * включаются. Мы ничего не «нормализуем» — как извлечено, так и раскладываем.
 * index сохраняет позицию в исходном документе, поэтому в `document.questions`
 * возможны пропуски номеров.
 *
 * @param marks  разметка правильных вариантов по вопросам; `undefined` — вопрос
 *   не участвовал в поиске указателя (у него меньше двух вариантов).
 * @param ambiguous  индексы вопросов (в `raw`) с противоречивым указателем.
 * @param consumedTextPrefixes  служебные префиксы текста по вариантам.
 * @param matching  индексы подтверждённых matching-вопросов.
 */
export function assembleTestDocument(
	raw: RawQuestion[],
	marks: (boolean[] | undefined)[],
	ambiguous: Set<number>,
	consumedTextPrefixes: ((string | null)[] | undefined)[] = [],
	matching: Set<number> = new Set()
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
		if (
			containsMachineMetadata(raw[qi]) ||
			containsDuplicatedTwoPrefixSyntax(raw[qi], text, consumedTextPrefixes[qi] ?? [])
		) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (!text || options.some(o => !o.text)) {
			rejectQuestion(QuestionRejectionReason.EMPTY_TEXT);
			continue;
		}
		if (options.length === 1) {
			rejectQuestion(QuestionRejectionReason.SINGLE_OPTION);
			continue;
		}
		if (options.length < 2) {
			rejectQuestion(QuestionRejectionReason.NO_OPTIONS);
			continue;
		}
		if (containsDuplicateOptions(options)) {
			rejectQuestion(QuestionRejectionReason.DUPLICATE_OPTIONS);
			continue;
		}
		if (containsConflictingAnswerMarker(raw[qi], consumedTextPrefixes[qi] ?? [])) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (containsOptionSyntaxInQuestionText(raw[qi])) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (matching.has(qi)) {
			const pairs = parseMatchingPairs(options);
			if (pairs) {
				questions.push({ index: qi + 1, text, type: 'matching', pairs });
				continue;
			}
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
