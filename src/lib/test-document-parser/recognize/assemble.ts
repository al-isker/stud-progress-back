import {
	ParseResult,
	ParseStatus,
	QuestionRejectionReason,
	RejectedQuestion
} from '../types/parse-result';
import { Question } from '../types/test-document';
import { parseMatchingPairs } from './matching';
import { DocumentStructureProfile, RawOption, RawQuestion, SegmentedDocument } from './segment';
import { QuestionSyntaxResult } from './syntax-profile';

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
	consumedTextPrefixes: (string | null)[],
	structure: DocumentStructureProfile
): boolean {
	if (structure.kind !== 'two-prefix' || !questionText.startsWith(structure.questionPrefix)) {
		return false;
	}
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

function containsConflictingAnswerMarker(
	question: RawQuestion,
	consumedTextPrefixes: (string | null)[]
): boolean {
	return question.options.some((option, optionIndex) => {
		const text = normalize(optionTextParts(option, consumedTextPrefixes[optionIndex] ?? null));

		return /^\+\s*\p{L}/u.test(text);
	});
}

function optionPrefixes(structure: DocumentStructureProfile): Set<string> {
	return new Set(structure.options?.prefixByFamily.values() ?? []);
}

function containsOptionSyntaxInQuestionText(
	question: RawQuestion,
	structure: DocumentStructureProfile
): boolean {
	const structuralPrefixes = optionPrefixes(structure);
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
 * Сборка не выводит синтаксис и не исправляет его: она получает результат
 * применения уже зафиксированного профиля и проверяет только общие инварианты
 * итогового контента.
 */
export function assembleTestDocument(
	document: SegmentedDocument,
	syntaxResults: QuestionSyntaxResult[]
): ParseResult {
	const { questions: raw, structure } = document;
	const questions: Question[] = [];
	const rejectedQuestions: RejectedQuestion[] = [];

	for (let qi = 0; qi < raw.length; qi++) {
		const syntax = syntaxResults[qi];
		const consumedTextPrefixes = syntax?.consumedTextPrefixes ?? raw[qi].options.map(() => null);
		const text = normalize(raw[qi].texts);
		const options = raw[qi].options.map((option, oi) => ({
			index: oi + 1,
			text: normalize(optionTextParts(option, consumedTextPrefixes[oi] ?? null)),
			isCorrect: syntax?.kind === 'choice' ? syntax.marked[oi] : false
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
			containsDuplicatedTwoPrefixSyntax(raw[qi], text, consumedTextPrefixes, structure)
		) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		const hasEmptyText = !text || options.some(option => !option.text);
		if (!hasEmptyText && options.length >= 2 && containsDuplicateOptions(options)) {
			rejectQuestion(QuestionRejectionReason.DUPLICATE_OPTIONS);
			continue;
		}
		if (
			syntax?.kind === 'rejected' &&
			syntax.reason === QuestionRejectionReason.MALFORMED_STRUCTURE
		) {
			rejectQuestion(syntax.reason);
			continue;
		}
		if (hasEmptyText) {
			rejectQuestion(QuestionRejectionReason.EMPTY_TEXT);
			continue;
		}
		if (options.length === 1 && !(syntax?.kind === 'choice' && syntax.grammar === 'percentage')) {
			rejectQuestion(QuestionRejectionReason.SINGLE_OPTION);
			continue;
		}
		if (options.length === 0) {
			rejectQuestion(QuestionRejectionReason.NO_OPTIONS);
			continue;
		}
		if (containsConflictingAnswerMarker(raw[qi], consumedTextPrefixes)) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (containsOptionSyntaxInQuestionText(raw[qi], structure)) {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (syntax?.kind === 'rejected') {
			rejectQuestion(syntax.reason);
			continue;
		}
		if (syntax?.kind === 'matching') {
			const pairs = parseMatchingPairs(options);
			if (pairs) {
				questions.push({ index: qi + 1, text, type: 'matching', pairs });
				continue;
			}
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
			continue;
		}
		if (!syntax || syntax.kind !== 'choice') {
			rejectQuestion(QuestionRejectionReason.MALFORMED_STRUCTURE);
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
