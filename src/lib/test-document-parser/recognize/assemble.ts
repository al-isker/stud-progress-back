import { ParseResult } from '../types/parse-result';
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

/** Строгая сборка результата: любые пустоты в текстах делают документ невалидным. */
export function assembleTestDocument(raw: RawQuestion[], marked: boolean[][]): ParseResult {
	const questions: Question[] = [];
	for (let qi = 0; qi < raw.length; qi++) {
		const text = normalize(raw[qi].texts);
		if (!text) return { status: 'invalid', reason: 'empty-question-text' };

		const options = raw[qi].options.map((option, oi) => ({
			index: oi + 1,
			text: normalize(option.texts),
			isCorrect: marked[qi][oi]
		}));
		if (options.some(o => !o.text)) return { status: 'invalid', reason: 'empty-option-text' };

		const correctCount = options.filter(o => o.isCorrect).length;
		questions.push({
			index: qi + 1,
			text,
			type: correctCount === 1 ? 'single' : 'multiple',
			options
		});
	}

	return { status: 'valid', document: { questions } };
}
