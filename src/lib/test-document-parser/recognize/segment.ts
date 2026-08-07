import { DocLine } from '../types/document-model';
import { QuestionRejectionReason } from '../types/parse-result';

/**
 * Вариант ответа до сборки. Структурный префикс определяется по всему документу,
 * а не вырезается локальной регуляркой. `sourcePrefix` сохраняет исходную
 * последовательность символов для последующего поиска маркера правильности.
 */
export interface RawOption {
	sourcePrefix: string | null;
	structuralPrefix: string | null;
	/** Останется ли непустой текст, если удалить весь sourcePrefix. */
	hasTextAfterSourcePrefix: boolean;
	texts: string[];
	lines: DocLine[];
}

/** Вопрос до сборки: строки текста вопроса и его варианты. */
export interface RawQuestion {
	texts: string[];
	options: RawOption[];
	/** Причина, по которой уже на этапе сегментации вопрос нельзя принимать. */
	rejectionReason?: QuestionRejectionReason;
}

/** Максимальная исходная последовательность поддерживаемых символов в начале строки. */
const SYMBOL_PREFIX_RE = /^\s*([~=+!?*•·◦▪‣✓✔√×<>#@&$%|/\\-]+)/;

interface SymbolHead {
	symbols: string;
}

interface OptionSyntax {
	prefixByFamily: Map<string, string>;
}

/** Неразрушающий лексический разбор: ничего не решает о границе префикса и текста. */
function scanSymbolHead(text: string): SymbolHead | null {
	const match = SYMBOL_PREFIX_RE.exec(text.trim());

	return match ? { symbols: match[1] } : null;
}

function commonPrefix(values: string[]): string {
	if (values.length === 0) return '';
	let prefix = values[0];
	for (let i = 1; i < values.length && prefix !== ''; i++) {
		while (!values[i].startsWith(prefix)) prefix = prefix.slice(0, -1);
	}

	return prefix;
}

function createOptionSyntax(heads: SymbolHead[], families: Set<string>): OptionSyntax | null {
	const prefixByFamily = new Map<string, string>();
	for (const family of families) {
		const values = heads.filter(head => head.symbols[0] === family).map(head => head.symbols);
		const prefix = commonPrefix(values);
		if (prefix) prefixByFamily.set(family, prefix);
	}

	return prefixByFamily.size > 0 ? { prefixByFamily } : null;
}

/**
 * Определяет семейства структурных префиксов по всем группам вариантов документа.
 * Случайный символ в одном вопросе не становится частью синтаксиса: семейство
 * должно встречаться в большинстве групп.
 */
function inferOptionSyntax(
	groups: string[][],
	minimumOptionStartsPerGroup = 2
): OptionSyntax | null {
	if (groups.length === 0) return null;
	const heads: SymbolHead[] = [];
	const groupsByFamily = new Map<string, Set<number>>();

	groups.forEach((group, groupIndex) => {
		for (const text of group) {
			const head = scanSymbolHead(text);
			if (!head) continue;
			heads.push(head);
			const family = head.symbols[0];
			const indices = groupsByFamily.get(family) ?? new Set<number>();
			indices.add(groupIndex);
			groupsByFamily.set(family, indices);
		}
	});

	const minGroups = Math.floor(groups.length / 2) + 1;
	const families = new Set(
		[...groupsByFamily]
			.filter(([, groupIndices]) => groupIndices.size >= minGroups)
			.map(([family]) => family)
	);
	const syntax = createOptionSyntax(heads, families);
	if (!syntax) return null;

	const structurallyValid = groups.filter(group => {
		const optionStarts = group.filter(text => {
			const head = scanSymbolHead(text);

			return head ? syntax.prefixByFamily.has(head.symbols[0]) : false;
		}).length;

		return optionStarts >= minimumOptionStartsPerGroup;
	}).length;

	return structurallyValid >= minGroups ? syntax : null;
}

function parseOptionStart(text: string, line: DocLine, syntax: OptionSyntax): RawOption | null {
	const trimmed = text.trim();
	const head = scanSymbolHead(trimmed);
	if (!head) return null;
	const structuralPrefix = syntax.prefixByFamily.get(head.symbols[0]);
	if (!structuralPrefix || !trimmed.startsWith(structuralPrefix)) return null;

	return {
		sourcePrefix: head.symbols,
		structuralPrefix,
		hasTextAfterSourcePrefix: trimmed.slice(head.symbols.length).trim() !== '',
		texts: [trimmed.slice(structuralPrefix.length).trim()],
		lines: [line]
	};
}

/** Начало нового параграфа: первая строка страницы или заметный вертикальный зазор. */
function isParagraphStart(line: DocLine): boolean {
	return line.gapBefore === null || line.gapBefore > line.size * 1.6;
}

/** Последний параграф из накопленного «хвоста» строк. */
function lastParagraph(tail: DocLine[]): DocLine[] {
	const paragraph: DocLine[] = [];
	for (let i = tail.length - 1; i >= 0; i--) {
		paragraph.unshift(tail[i]);
		if (isParagraphStart(tail[i])) break;
	}

	return paragraph;
}

/** Соседняя строка того же визуального блока многострочного вопроса. */
function hasCompatibleQuestionStyle(candidate: DocLine, opener: DocLine): boolean {
	return (
		candidate.page === opener.page &&
		Math.abs(candidate.x0 - opener.x0) <= opener.size &&
		Math.abs(candidate.size - opener.size) <= 0.5 &&
		Math.abs(candidate.boldFrac - opener.boldFrac) <= 0.2 &&
		Math.abs(candidate.italicFrac - opener.italicFrac) <= 0.2
	);
}

function startsWithLowercaseLetter(text: string): boolean {
	const firstLetter = /\p{L}/u.exec(text)?.[0];

	return Boolean(
		firstLetter &&
			firstLetter === firstLetter.toLocaleLowerCase() &&
			firstLetter !== firstLetter.toLocaleUpperCase()
	);
}

function questionLead(tail: DocLine[], opener: DocLine, beforeOpen: string): DocLine[] {
	if (!isParagraphStart(opener)) return lastParagraph(tail);
	if (!startsWithLowercaseLetter(beforeOpen)) return [];
	const lines: DocLine[] = [];
	for (let i = tail.length - 1; i >= 0; i--) {
		if (!hasCompatibleQuestionStyle(tail[i], opener)) break;
		lines.unshift(tail[i]);
	}

	return lines;
}

/**
 * Схема «скобочная»: текст вопроса открывает блок вариантов скобкой «{», блок
 * закрывается «}». Скобки могут стоять где угодно в строке — в том числе первый
 * вариант идёт на одной строке с «{». Варианты внутри блока начинаются с
 * символьного токена; строка без токена — продолжение предыдущего варианта.
 */
function tryBracketScheme(lines: DocLine[]): RawQuestion[] | null {
	const hasOpen = lines.some(l => l.text.includes('{'));
	const hasClose = lines.some(l => l.text.includes('}'));
	if (!hasOpen || !hasClose) return null;

	interface SegmentDraft {
		text: string;
		line: DocLine;
	}
	interface QuestionDraft {
		texts: string[];
		segments: SegmentDraft[];
		rejectionReason?: QuestionRejectionReason;
	}

	const drafts: QuestionDraft[] = [];
	let tail: DocLine[] = [];
	let inBlock = false;
	let qTexts: string[] = [];
	let segments: SegmentDraft[] = [];
	let rejectionReason: QuestionRejectionReason | undefined;

	const closeBlock = () => {
		if (qTexts.length > 0 || segments.length > 0) {
			drafts.push({ texts: qTexts, segments, rejectionReason });
		}
		qTexts = [];
		segments = [];
		rejectionReason = undefined;
		inBlock = false;
	};

	const addBlockSegment = (raw: string, line: DocLine) => {
		const text = raw.trim();
		if (text !== '') segments.push({ text, line });
	};

	/** Есть ли ещё закрывающая скобка до начала следующего блока вопросов. */
	const hasLaterCloseBeforeNextOpen = (lineIndex: number, afterCurrentClose: string): boolean => {
		for (let i = lineIndex; i < lines.length; i++) {
			const text = i === lineIndex ? afterCurrentClose : lines[i].text;
			const nextOpen = text.indexOf('{');
			const nextClose = text.indexOf('}');
			if (nextClose >= 0 && (nextOpen < 0 || nextClose < nextOpen)) return true;
			if (nextOpen >= 0) return false;
		}

		return false;
	};

	const openBlock = (before: string, line: DocLine) => {
		const paragraph = before !== '' ? questionLead(tail, line, before) : lastParagraph(tail);
		qTexts = paragraph.map(l => l.text.trim());
		if (before !== '') qTexts.push(before);
		tail = [];
		segments = [];
		rejectionReason = undefined;
		inBlock = true;
	};

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		let rest = line.text.trim();
		let consumedOnLine = false;
		while (rest.length > 0) {
			if (!inBlock) {
				const open = rest.indexOf('{');
				if (open < 0) {
					if (!consumedOnLine && rest !== '}') tail.push(line);
					break;
				}
				openBlock(rest.slice(0, open).trim(), line);
				rest = rest.slice(open + 1);
				consumedOnLine = true;
			} else {
				const close = rest.indexOf('}');
				const nestedOpen = rest.indexOf('{');
				const beforeNestedOpen = nestedOpen >= 0 ? rest.slice(0, nestedOpen).trim() : '';
				const nestedOpenEndsLine = nestedOpen >= 0 && rest.slice(nestedOpen + 1).trim() === '';
				const nestedOpenStartsQuestion =
					beforeNestedOpen !== '' &&
					scanSymbolHead(beforeNestedOpen) === null &&
					isParagraphStart(line);
				if (
					nestedOpen >= 0 &&
					(close < 0 || nestedOpen < close) &&
					(beforeNestedOpen === '' || nestedOpenEndsLine || nestedOpenStartsQuestion)
				) {
					rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
				}
				if (close < 0) {
					addBlockSegment(rest, line);
					break;
				}
				const afterClose = rest.slice(close + 1);
				const attachedToOptionText = rest.slice(0, close).trim() !== '';
				const nextLineStartsWithSymbol =
					lineIndex + 1 < lines.length && scanSymbolHead(lines[lineIndex + 1].text) !== null;
				if (
					attachedToOptionText &&
					nextLineStartsWithSymbol &&
					hasLaterCloseBeforeNextOpen(lineIndex, afterClose)
				) {
					rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
				}
				addBlockSegment(rest.slice(0, close), line);
				closeBlock();
				rest = afterClose;
				consumedOnLine = true;
			}
		}
	}
	if (inBlock) closeBlock();

	// Скобки уже надёжно задают границы вопросов. Поэтому одноответные блоки
	// тоже участвуют в подтверждении общего префикса и позже отклоняются точечно.
	const syntax = inferOptionSyntax(
		drafts.map(draft => draft.segments.map(segment => segment.text)),
		1
	);
	if (!syntax) return null;

	const questions: RawQuestion[] = drafts.map(draft => {
		const texts = [...draft.texts];
		const options: RawOption[] = [];
		for (const segment of draft.segments) {
			const option = parseOptionStart(segment.text, segment.line, syntax);
			if (option) {
				options.push(option);
			} else if (options.length > 0) {
				const previous = options[options.length - 1];
				previous.texts.push(segment.text);
				previous.lines.push(segment.line);
			} else {
				texts.push(segment.text);
			}
		}

		return { texts, options, rejectionReason: draft.rejectionReason };
	});
	return questions.length > 0 ? questions : null;
}

/**
 * Схема «двухпрефиксная»: одно символьное семейство открывает вопросы,
 * другое — варианты («? вопрос» / «! вариант» / «!+ правильный»).
 * Строка без токена — продолжение в своём параграфе, иначе игнорируется.
 */
function tryTwoPrefixScheme(lines: DocLine[]): RawQuestion[] | null {
	const heads = lines.map(line => scanSymbolHead(line.text));
	const families = new Map<string, number>();
	for (const head of heads) {
		if (head) families.set(head.symbols[0], (families.get(head.symbols[0]) ?? 0) + 1);
	}
	if (families.size < 2) return null;

	let best: { q: string; v: string; qCount: number } | null = null;
	for (const [qFam] of families) {
		for (const [vFam] of families) {
			if (qFam === vFam) continue;
			let qCount = 0;
			let vTotal = 0;
			let sinceQ = -1;
			let ok = true;
			for (const head of heads) {
				const fam = head ? head.symbols[0] : null;
				if (fam === qFam) {
					if (sinceQ >= 0 && sinceQ < 2) {
						ok = false;
						break;
					}
					qCount++;
					sinceQ = 0;
				} else if (fam === vFam) {
					if (sinceQ >= 0) sinceQ++;
					vTotal++;
				}
			}
			if (sinceQ >= 0 && sinceQ < 2) ok = false;
			if (ok && qCount >= 2 && vTotal >= qCount * 2 && (!best || qCount > best.qCount)) {
				best = { q: qFam, v: vFam, qCount };
			}
		}
	}
	if (!best) return null;
	const presentHeads = heads.filter((head): head is SymbolHead => head !== null);
	const questionPrefix = commonPrefix(
		presentHeads.filter(head => head.symbols[0] === best.q).map(head => head.symbols)
	);
	const optionSyntax = createOptionSyntax(presentHeads, new Set([best.v]));
	if (!questionPrefix || !optionSyntax) return null;

	const questions: RawQuestion[] = [];
	let current: RawQuestion | null = null;
	let mode: 'question' | 'option' | 'none' = 'none';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const head = heads[i];
		const fam = head ? head.symbols[0] : null;
		if (fam === best.q) {
			if (current) questions.push(current);
			current = {
				texts: [line.text.trim().slice(questionPrefix.length).trim()],
				options: []
			};
			mode = 'question';
		} else if (fam === best.v && current) {
			const option = parseOptionStart(line.text, line, optionSyntax);
			if (!option) {
				mode = 'none';
				continue;
			}
			current.options.push(option);
			mode = 'option';
		} else if (current && mode !== 'none' && !isParagraphStart(line)) {
			if (mode === 'question') {
				current.texts.push(line.text.trim());
			} else {
				const option = current.options[current.options.length - 1];
				option.texts.push(line.text.trim());
				option.lines.push(line);
			}
		} else {
			mode = 'none';
		}
	}
	if (current) questions.push(current);

	return questions.length > 0 ? questions : null;
}

const STANDALONE_NUM_RE = /^[#№]\s*(\d{1,3})\s*[.):\]]?$/;
const STANDALONE_NUM_DOT_RE = /^(\d{1,3})\s*[.):\]]$/;
const INLINE_NUM_RE = /^[#№]?\s*(\d{1,3})\s*[.):\]]\s+(\S.*)$/;

/**
 * Схема «нумераторная»: вопросы открываются номером-меткой («#1», «2.»,
 * «3) текст…»). Первый параграф после номера — текст вопроса, каждый следующий
 * параграф — вариант. Преамбула до первого номера отбрасывается.
 *
 * Нумерация должна стартовать с «1», но дальше значения номеров не сверяются:
 * в реальных PDF цифры глифов бывают перекодированы (напр. «#4» → «#233»), а
 * структурно это всё равно очередная метка вопроса.
 */
function tryNumberedScheme(lines: DocLine[]): RawQuestion[] | null {
	const markers: { index: number; value: number; rest: string | null }[] = [];
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i].text.trim();
		const standalone = STANDALONE_NUM_RE.exec(t) ?? STANDALONE_NUM_DOT_RE.exec(t);
		if (standalone) {
			markers.push({ index: i, value: Number(standalone[1]), rest: null });
			continue;
		}
		const inline = INLINE_NUM_RE.exec(t);
		if (inline) markers.push({ index: i, value: Number(inline[1]), rest: inline[2] });
	}
	const anchor = markers.findIndex(m => m.value === 1);
	if (anchor < 0) return null;
	const starters = markers.slice(anchor);
	if (starters.length < 2) return null;

	const questions: RawQuestion[] = [];
	for (let s = 0; s < starters.length; s++) {
		const { index, rest } = starters[s];
		const end = s + 1 < starters.length ? starters[s + 1].index : lines.length;
		const texts: string[] = rest ? [rest] : [];
		const options: RawOption[] = [];
		let inQuestion = true;
		for (let i = index + 1; i < end; i++) {
			const line = lines[i];
			const newParagraph = isParagraphStart(line);
			if (inQuestion && (texts.length === 0 || !newParagraph)) {
				texts.push(line.text.trim());
				continue;
			}
			inQuestion = false;
			if (newParagraph || options.length === 0) {
				options.push({
					sourcePrefix: null,
					structuralPrefix: null,
					hasTextAfterSourcePrefix: false,
					texts: [line.text.trim()],
					lines: [line]
				});
			} else {
				const option = options[options.length - 1];
				option.texts.push(line.text.trim());
				option.lines.push(line);
			}
		}
		questions.push({ texts, options });
	}

	// Если большинство вариантов всё же несёт единый документный синтаксис — применяем его.
	const allOptions = questions.flatMap(q => q.options);
	const syntax = inferOptionSyntax(
		questions.map(question => question.options.map(option => option.texts[0] ?? ''))
	);
	if (syntax && allOptions.length > 0) {
		const parsed = allOptions.map(option =>
			parseOptionStart(option.texts[0] ?? '', option.lines[0], syntax)
		);
		const recognized = parsed.filter(Boolean).length;
		if (recognized >= allOptions.length * 0.6) {
			allOptions.forEach((option, index) => {
				const detected = parsed[index];
				if (!detected) return;
				option.sourcePrefix = detected.sourcePrefix;
				option.structuralPrefix = detected.structuralPrefix;
				option.hasTextAfterSourcePrefix = detected.hasTextAfterSourcePrefix;
				option.texts[0] = detected.texts[0];
			});
		}
	}

	return questions;
}

/**
 * Сегментация строк документа на вопросы и варианты. Схемы пробуются от самого
 * сильного структурного сигнала к более слабому; null — структура не распознана.
 */
export function segmentQuestions(lines: DocLine[]): RawQuestion[] | null {
	return tryBracketScheme(lines) ?? tryTwoPrefixScheme(lines) ?? tryNumberedScheme(lines);
}
