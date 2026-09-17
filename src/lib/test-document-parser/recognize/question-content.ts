import { QuestionRejectionReason } from '../types/parse-result';
import { DocumentStructureProfile, RawOption, RawQuestion } from './segment';

/**
 * Склеивает строки варианта/вопроса. Только мягкий перенос `U+00AD` является
 * однозначным указанием объединить части слова без дефиса. Любая видимая
 * чёрточка сохраняется; в остальных случаях строки разделяются пробелом.
 */
export function normalizeQuestionText(parts: string[]): string {
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

/** Удаляет только точный префикс, подтверждённый профилем маркера. */
export function optionTextParts(option: RawOption, consumedTextPrefix: string | null): string[] {
	const parts = [...option.texts];
	if (consumedTextPrefix && parts[0]?.startsWith(consumedTextPrefix)) {
		parts[0] = parts[0].slice(consumedTextPrefix.length).trimStart();
	}

	return parts;
}

export interface MaterializedQuestionContent {
	text: string;
	options: Array<{ index: number; text: string }>;
}

export function materializeQuestionContent(
	question: RawQuestion,
	consumedTextPrefixes: (string | null)[]
): MaterializedQuestionContent {
	return {
		text: normalizeQuestionText(question.texts),
		options: question.options.map((option, optionIndex) => ({
			index: optionIndex + 1,
			text: normalizeQuestionText(
				optionTextParts(option, consumedTextPrefixes[optionIndex] ?? null)
			)
		}))
	};
}

const MACHINE_METADATA_RE = /(?:^|\s)@MDID\s*\{[0-9A-F-]+\}/iu;

export function containsMachineMetadata(question: RawQuestion): boolean {
	return [...question.texts, ...question.options.flatMap(option => option.texts)].some(part =>
		MACHINE_METADATA_RE.test(part)
	);
}

export function containsDuplicatedTwoPrefixSyntax(
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
		const text = normalizeQuestionText(
			optionTextParts(option, consumedTextPrefixes[index] ?? null)
		);

		return text.startsWith(option.structuralPrefix);
	}).length;

	return duplicatedOptions >= 2;
}

export function containsDuplicateOptions(options: { text: string }[]): boolean {
	const normalized = options.map(option => option.text.toLocaleLowerCase());

	return new Set(normalized).size !== normalized.length;
}

function optionPrefixes(structure: DocumentStructureProfile): Set<string> {
	return new Set(structure.options?.prefixByFamily.values() ?? []);
}

export function containsOptionSyntaxInQuestionText(
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
 * Причина, не зависящая от выбора маркера ответа. Такие вопросы нельзя
 * использовать как доказательство документного профиля.
 */
export function profileIndependentRejectionReason(
	question: RawQuestion,
	structure: DocumentStructureProfile
): QuestionRejectionReason | null {
	if (question.rejectionReason) return question.rejectionReason;
	if (containsMachineMetadata(question)) return QuestionRejectionReason.MALFORMED_STRUCTURE;
	const content = materializeQuestionContent(
		question,
		question.options.map(() => null)
	);
	if (!content.text || content.options.some(option => !option.text)) {
		return QuestionRejectionReason.EMPTY_TEXT;
	}
	if (containsOptionSyntaxInQuestionText(question, structure)) {
		return QuestionRejectionReason.MALFORMED_STRUCTURE;
	}

	return null;
}

/**
 * Проверки, результат которых зависит от точного текстового префикса,
 * потреблённого уже подтверждённым маркером.
 */
export function profileDependentRejectionReason(
	question: RawQuestion,
	structure: DocumentStructureProfile,
	consumedTextPrefixes: (string | null)[]
): QuestionRejectionReason | null {
	const content = materializeQuestionContent(question, consumedTextPrefixes);
	if (containsDuplicatedTwoPrefixSyntax(question, content.text, consumedTextPrefixes, structure)) {
		return QuestionRejectionReason.MALFORMED_STRUCTURE;
	}
	const hasEmptyText = !content.text || content.options.some(option => !option.text);
	if (hasEmptyText) return QuestionRejectionReason.EMPTY_TEXT;
	if (content.options.length >= 2 && containsDuplicateOptions(content.options)) {
		return QuestionRejectionReason.DUPLICATE_OPTIONS;
	}

	return null;
}
