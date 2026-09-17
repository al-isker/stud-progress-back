import { DocLine } from '../types/document-model';
import { QuestionRejectionReason } from '../types/parse-result';
import {
	continuesReadingFlow,
	hasCompatibleLineLayout,
	hasCompatibleTypography,
	isParagraphStart
} from './line-layout';

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
const SYMBOL_PREFIX_RE = /^\s*([~=+!?*•·◦▪‣✓✔√×<>#@&$%|/\\\-–—−]+)/;

interface SymbolHead {
	symbols: string;
}

export interface OptionSyntaxProfile {
	prefixByFamily: Map<string, string>;
}

export type NumberedQuestionMarkerFamily = '#' | '№' | 'bare';
export type NumberedQuestionMarkerTerminator = '' | '.' | ')' | ':' | ']';

/** Лексическая форма границы вопроса в нумераторном документе. */
export interface NumberedQuestionSyntaxProfile {
	family: NumberedQuestionMarkerFamily;
	terminator: NumberedQuestionMarkerTerminator;
	placement: 'standalone' | 'inline';
}

/** Структура границ вопросов и вариантов, подтверждённая на всём документе. */
export type DocumentStructureProfile =
	| { kind: 'bracket'; options: OptionSyntaxProfile }
	| { kind: 'two-prefix'; questionPrefix: string; options: OptionSyntaxProfile }
	| {
			kind: 'numbered';
			question: NumberedQuestionSyntaxProfile;
			options: OptionSyntaxProfile | null;
	  };

/** Результат сегментации вместе с профилем, по которому она выполнена. */
export interface SegmentedDocument {
	questions: RawQuestion[];
	structure: DocumentStructureProfile;
}

type BracketSchemeAttempt =
	| { kind: 'not-applicable' }
	| { kind: 'untrusted-profile' }
	| { kind: 'segmented'; document: SegmentedDocument };

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

function createOptionSyntax(
	heads: SymbolHead[],
	families: Set<string>
): OptionSyntaxProfile | null {
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
): OptionSyntaxProfile | null {
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
	// В скобочном GIFT-синтаксисе `~`, `=` и процентный score могут начинать
	// варианты одного документа. Процент иногда записан без `~`: `%50%answer`.
	// Если основная семья подтверждена большинством блоков, наблюдаемые редкие
	// формы тоже считаются частью того же синтаксиса.
	if (families.has('~') || families.has('=') || families.has('%')) {
		if (groupsByFamily.has('~')) families.add('~');
		if (groupsByFamily.has('=')) families.add('=');
		if (groupsByFamily.has('%')) families.add('%');
		for (const dash of ['–', '—']) {
			const repeatedInOneBlock = groups.some(
				group => group.filter(text => scanSymbolHead(text)?.symbols[0] === dash).length >= 2
			);
			if (repeatedInOneBlock) families.add(dash);
		}
	}
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

function parseOptionStart(
	text: string,
	line: DocLine,
	syntax: OptionSyntaxProfile
): RawOption | null {
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

function splitInlineDecoratedOption(
	text: string,
	line: DocLine,
	syntax: OptionSyntaxProfile
): { questionText: string; option: RawOption } | null {
	for (let index = 1; index < text.length; index++) {
		if (!/\s/u.test(text[index - 1])) continue;
		const candidate = text.slice(index).trimStart();
		const option = parseOptionStart(candidate, line, syntax);
		if (
			!option ||
			!option.sourcePrefix ||
			!option.structuralPrefix ||
			option.sourcePrefix.length <= option.structuralPrefix.length ||
			!option.hasTextAfterSourcePrefix
		) {
			continue;
		}
		const questionText = text.slice(0, index).trim();
		if (questionText !== '') return { questionText, option };
	}

	return null;
}

interface QuestionLead {
	lines: DocLine[];
	rejectionReason?: QuestionRejectionReason;
}

function inferNormalLineGapRatio(lines: DocLine[]): number {
	const buckets = new Map<number, number>();
	for (const line of lines) {
		if (line.gapBefore === null || line.size <= 0) continue;
		const ratio = line.gapBefore / line.size;
		if (ratio < 0.4 || ratio > 8) continue;
		const bucket = Math.round(ratio * 10);
		buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
	}
	if (buckets.size === 0) return 1;

	let bestBucket = 0;
	let bestCount = -1;
	for (const bucket of buckets.keys()) {
		const count =
			(buckets.get(bucket - 1) ?? 0) + (buckets.get(bucket) ?? 0) + (buckets.get(bucket + 1) ?? 0);
		if (count > bestCount || (count === bestCount && bucket < bestBucket)) {
			bestBucket = bucket;
			bestCount = count;
		}
	}

	return bestBucket / 10;
}

function hasNormalLineGap(previous: DocLine, next: DocLine, maximumGapRatio: number): boolean {
	if (continuesReadingFlow(previous, next)) return true;
	if (previous.page !== next.page || next.gapBefore === null || next.size <= 0) return false;

	return next.gapBefore / next.size <= maximumGapRatio;
}

function connectedTail(tail: DocLine[], lastIndex: number, maximumGapRatio: number): DocLine[] {
	const lines = [tail[lastIndex]];
	let next = tail[lastIndex];
	for (let index = lastIndex - 1; index >= 0; index--) {
		const candidate = tail[index];
		if (!hasNormalLineGap(candidate, next, maximumGapRatio)) break;
		lines.unshift(candidate);
		next = candidate;
	}

	return lines;
}

/**
 * Определяет только структурно подтверждённое начало вопроса перед строкой с
 * `{`. Регистр и смысл текста не используются.
 *
 * Строки с обычным для документа интервалом образуют единый блок независимо
 * от регистра и локальных отступов. Через границу страницы/колонки блок
 * продолжается только при совместимом оформлении. Аномальный разрыв при том
 * же оформлении противоречив: обе части сохраняются, а вопрос отклоняется,
 * чтобы не принять его усечённую версию.
 */
function questionLead(
	tail: DocLine[],
	opener: DocLine,
	maximumGapRatio: number,
	allowReadingFlowReindent: boolean,
	openerHasInlineLead: boolean
): QuestionLead {
	const lines: DocLine[] = [];
	let next = opener;
	for (let index = tail.length - 1; index >= 0; index--) {
		const candidate = tail[index];
		const readingFlowBoundary = continuesReadingFlow(candidate, next);
		// У отдельной `{` нет текстового оформления: её шрифт не может опровергать
		// принадлежность непосредственно предшествующей строки формулировке.
		const delimiterOnlyBoundary = next === opener && !openerHasInlineLead;
		const compatibleAcrossReadingFlow =
			delimiterOnlyBoundary ||
			(allowReadingFlowReindent
				? hasCompatibleTypography(candidate, next) || hasCompatibleTypography(candidate, opener)
				: hasCompatibleLineLayout(candidate, next) || hasCompatibleLineLayout(candidate, opener));
		if (
			hasNormalLineGap(candidate, next, maximumGapRatio) &&
			(!readingFlowBoundary || compatibleAcrossReadingFlow)
		) {
			lines.unshift(candidate);
			next = candidate;
			continue;
		}
		if (readingFlowBoundary) {
			if (!allowReadingFlowReindent && hasCompatibleTypography(candidate, next)) break;
			// Через страницу/колонку нет измеримого межстрочного интервала. Если
			// оформление изменилось, нельзя доказать, что предыдущая строка была
			// заголовком, а не первой частью stem: сохраняем обе и отклоняем вместо
			// принятия усечённого вопроса.
			return {
				lines: [...tail.slice(0, index + 1), ...lines],
				rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
			};
		}
		if (!hasCompatibleTypography(candidate, next)) break;

		const compatibleWithInlineLead = hasCompatibleLineLayout(candidate, opener);
		const possibleIndentedContinuation =
			allowReadingFlowReindent && candidate.x0 <= next.x0 && candidate.x1 >= next.x1;
		if (!compatibleWithInlineLead && !possibleIndentedContinuation) break;

		return {
			lines: [...connectedTail(tail, index, maximumGapRatio), ...lines],
			rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
		};
	}

	return { lines };
}

/**
 * В скобочной грамматике нет явного маркера начала stem. Поэтому отдельный
 * визуальный префикс нельзя безопасно объявить заголовком и удалить: это может
 * быть первой частью вопроса. Противоречие сохраняется целиком и ведёт в reject.
 */
function hasConflictingLeadingVisualBlock(
	lead: DocLine[],
	opener: DocLine,
	hasInlineLead: boolean,
	isFirstBlock: boolean
): boolean {
	if (lead.length === 0) return false;
	const bodyAnchor = hasInlineLead ? opener : lead[lead.length - 1];
	let bodyStart = lead.length;
	while (bodyStart > 0 && hasCompatibleTypography(lead[bodyStart - 1], bodyAnchor)) {
		bodyStart--;
	}
	if (bodyStart === 0) return false;

	const prefixAnchor = lead[bodyStart - 1];
	const firstBodyLine = lead[bodyStart] ?? opener;
	if (continuesReadingFlow(prefixAnchor, firstBodyLine)) return false;

	return isParagraphStart(firstBodyLine) || isFirstBlock;
}

/**
 * Схема «скобочная»: текст вопроса открывает блок вариантов скобкой «{», блок
 * закрывается «}». Скобки могут стоять где угодно в строке — в том числе первый
 * вариант идёт на одной строке с «{». Варианты внутри блока начинаются с
 * символьного токена; строка без токена — продолжение предыдущего варианта.
 */
function tryBracketScheme(lines: DocLine[]): BracketSchemeAttempt {
	const hasOpen = lines.some(l => l.text.includes('{'));
	const hasClose = lines.some(l => l.text.includes('}'));
	if (!hasOpen || !hasClose) return { kind: 'not-applicable' };
	const maximumQuestionGapRatio = Math.max(1.6, inferNormalLineGapRatio(lines) * 1.35);

	interface SegmentDraft {
		text: string;
		line: DocLine;
	}
	interface QuestionDraft {
		texts: string[];
		segments: SegmentDraft[];
		rejectionReason?: QuestionRejectionReason;
	}
	interface BracketBlock {
		inlineLead: string;
		/** Непустой inlineLead начался сразу после `}` предыдущего блока на той же строке. */
		inlineLeadAfterBalancedClose: boolean;
		opener: DocLine;
		openerLineIndex: number;
		segments: SegmentDraft[];
		/** Содержимое сбалансированных `{...}` после non-option lead. */
		balancedNestedCandidates: SegmentDraft[];
		/** Блок восстановлен по отдельной `{` внутри незакрытого соседа. */
		requiresConfirmedOptionEnvelope?: boolean;
		closed: boolean;
		rejectionReason?: QuestionRejectionReason;
	}
	interface OutsideText {
		kind: 'text';
		line: DocLine;
		/** Фрагмент находился после закрытия сбалансированного блока на той же строке. */
		afterBalancedClose: boolean;
	}
	interface OutsideClose {
		kind: 'close';
		line: DocLine;
	}
	type OutsideToken = OutsideText | OutsideClose;
	type TopLevelToken = OutsideToken | { kind: 'block'; block: BracketBlock };

	const tokens: TopLevelToken[] = [];
	let block: BracketBlock | null = null;

	const fragmentLine = (line: DocLine, raw: string): DocLine => ({
		...line,
		text: raw.trim()
	});

	const addOutsideText = (raw: string, line: DocLine, afterBalancedClose: boolean) => {
		const text = raw.trim();
		if (text === '') return;
		tokens.push({
			kind: 'text',
			line: fragmentLine(line, text),
			afterBalancedClose
		});
	};

	const addBlockSegment = (raw: string, line: DocLine) => {
		const text = raw.trim();
		if (text !== '' && block) block.segments.push({ text, line: fragmentLine(line, text) });
	};

	const finishBlock = (closed: boolean) => {
		if (!block) return;
		block.closed = closed;
		if (!closed) block.rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
		tokens.push({ kind: 'block', block });
		block = null;
	};
	const trailingLeadStart = (segments: SegmentDraft[]): number => {
		let start = segments.length;
		while (
			start > 0 &&
			scanSymbolHead(segments[start - 1].text) === null &&
			!/^[{}]+$/.test(segments[start - 1].text.trim())
		) {
			start--;
		}

		return start;
	};
	const optionLikeSegmentCount = (segments: SegmentDraft[]): number =>
		segments.filter(segment => scanSymbolHead(segment.text) !== null).length;

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

	// Первая фаза ничего не присваивает вопросам: сохраняет в исходном порядке
	// сбалансированные блоки, внешний текст и лишние закрывающие скобки.
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex];
		let rest = line.text.trim();
		let afterBalancedClose = false;
		while (rest.length > 0) {
			if (!block) {
				const open = rest.indexOf('{');
				const close = rest.indexOf('}');
				if (close >= 0 && (open < 0 || close < open)) {
					addOutsideText(rest.slice(0, close), line, afterBalancedClose);
					tokens.push({ kind: 'close', line: fragmentLine(line, '}') });
					rest = rest.slice(close + 1).trim();
					// Любой текст после лишней `}` на той же строке остаётся связанным
					// с повреждённой границей. Иначе в последовательности `} } Q {`
					// вторая скобка стирала provenance и позволяла принять Q.
					afterBalancedClose = true;
					continue;
				}
				if (open < 0) {
					addOutsideText(rest, line, afterBalancedClose);
					break;
				}
				const inlineLead = rest.slice(0, open).trim();
				block = {
					inlineLead,
					inlineLeadAfterBalancedClose: afterBalancedClose && inlineLead !== '',
					opener: fragmentLine(line, '{'),
					openerLineIndex: lineIndex,
					segments: [],
					balancedNestedCandidates: [],
					closed: false
				};
				rest = rest.slice(open + 1).trim();
				afterBalancedClose = false;
			} else {
				let close = rest.indexOf('}');
				const nestedOpen = rest.indexOf('{');
				const blockHasOptionLikeSegment = optionLikeSegmentCount(block.segments) > 0;
				const beforeNestedOpen = nestedOpen >= 0 ? rest.slice(0, nestedOpen).trim() : '';
				const nestedOpenEndsLine = nestedOpen >= 0 && rest.slice(nestedOpen + 1).trim() === '';
				const trailingNonSymbolLead =
					block.segments.length > 0 &&
					scanSymbolHead(block.segments[block.segments.length - 1].text) === null &&
					!/^[{}]+$/.test(block.segments[block.segments.length - 1].text.trim());
				const nestedOpenStartsQuestion =
					beforeNestedOpen !== '' &&
					scanSymbolHead(beforeNestedOpen) === null &&
					!(blockHasOptionLikeSegment && close > nestedOpen) &&
					(isParagraphStart(line) || trailingNonSymbolLead);
				if (nestedOpen === 0 && nestedOpenEndsLine) {
					const previousBlock = block;
					const tailStart = trailingLeadStart(previousBlock.segments);
					const recoveredLead = previousBlock.segments.slice(tailStart);
					const precedingSegment = previousBlock.segments[tailStart - 1];
					const hasSeparateCompleteEnvelope =
						recoveredLead.length > 0 &&
						optionLikeSegmentCount(previousBlock.segments.slice(0, tailStart)) >= 2 &&
						precedingSegment !== undefined &&
						!hasNormalLineGap(
							precedingSegment.line,
							recoveredLead[0].line,
							maximumQuestionGapRatio
						);
					if (hasSeparateCompleteEnvelope) {
						previousBlock.segments.splice(tailStart);
						finishBlock(false);
						for (const segment of recoveredLead) {
							addOutsideText(segment.text, segment.line, false);
						}
						block = {
							inlineLead: '',
							inlineLeadAfterBalancedClose: false,
							opener: fragmentLine(line, '{'),
							openerLineIndex: lineIndex,
							segments: [],
							balancedNestedCandidates: [],
							requiresConfirmedOptionEnvelope: true,
							closed: false
						};
						rest = '';
						afterBalancedClose = false;
						continue;
					}
				}
				if (nestedOpen >= 0 && (close < 0 || nestedOpen < close) && nestedOpenStartsQuestion) {
					const previousBlock = block;
					const tailStart = trailingLeadStart(previousBlock.segments);
					const recoveredLead = previousBlock.segments.splice(tailStart);
					const previousBlockHasOptionEnvelope =
						optionLikeSegmentCount(previousBlock.segments) >= 2;
					const precedingSegment = previousBlock.segments.at(-1);
					const leadIsSeparated =
						recoveredLead.length === 0 ||
						!precedingSegment ||
						!hasNormalLineGap(
							precedingSegment.line,
							recoveredLead[0].line,
							maximumQuestionGapRatio
						);
					const attachedToSameLine = previousBlock.openerLineIndex === lineIndex;
					// У нового блока есть собственный непустой lead, `{` и абзацная
					// граница. Этого достаточно, чтобы не дать незакрытому вопросу
					// поглотить корректного соседа. Связный многострочный lead
					// переносится целиком; если его нельзя отделить от старого варианта
					// или обе `{` стоят в одной строке, новый блок тоже неоднозначен.
					// Без уже начавшегося полноценного списка вариантов первая `{` не
					// ограничивает отдельный повреждённый вопрос: это может быть одна
					// непрерывная формулировка с ошибочной скобкой, поэтому восстановление
					// запрещено.
					finishBlock(false);
					for (const segment of recoveredLead) {
						addOutsideText(segment.text, segment.line, false);
					}
					block = {
						inlineLead: beforeNestedOpen,
						inlineLeadAfterBalancedClose: false,
						opener: fragmentLine(line, '{'),
						openerLineIndex: lineIndex,
						segments: [],
						balancedNestedCandidates: [],
						closed: false,
						rejectionReason:
							attachedToSameLine || !leadIsSeparated || !previousBlockHasOptionEnvelope
								? QuestionRejectionReason.MALFORMED_STRUCTURE
								: undefined
					};
					rest = rest.slice(nestedOpen + 1).trim();
					afterBalancedClose = false;
					continue;
				}
				if (
					nestedOpen >= 0 &&
					close > nestedOpen &&
					beforeNestedOpen !== '' &&
					(scanSymbolHead(beforeNestedOpen) !== null || blockHasOptionLikeSegment)
				) {
					// Сбалансированные скобки внутри уже начатого варианта, в том числе
					// в строке-продолжении, являются его буквальным содержимым. Ищем
					// только следующую `}` нулевой вложенности, чтобы внутренняя пара
					// не усекла весь вопрос.
					let depth = 0;
					let balancedNestedClose = -1;
					close = -1;
					for (let index = nestedOpen; index < rest.length; index++) {
						if (rest[index] === '{') depth++;
						else if (rest[index] === '}') {
							if (depth > 0) {
								depth--;
								if (depth === 0 && balancedNestedClose < 0) balancedNestedClose = index;
							} else {
								close = index;
								break;
							}
						}
					}
					if (
						blockHasOptionLikeSegment &&
						scanSymbolHead(beforeNestedOpen) === null &&
						balancedNestedClose > nestedOpen
					) {
						const candidate = rest.slice(nestedOpen + 1, balancedNestedClose).trim();
						if (candidate !== '') {
							block.balancedNestedCandidates.push({
								text: candidate,
								line: fragmentLine(line, candidate)
							});
						}
					}
				}
				if (
					nestedOpen >= 0 &&
					(close < 0 || nestedOpen < close) &&
					(beforeNestedOpen === '' || nestedOpenEndsLine)
				) {
					block.rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
				}
				if (close < 0) {
					addBlockSegment(rest, line);
					break;
				}
				const afterClose = rest.slice(close + 1);
				const nextLineStartsWithSymbol =
					lineIndex + 1 < lines.length && scanSymbolHead(lines[lineIndex + 1].text) !== null;
				if (
					(afterClose.trim() !== '' || nextLineStartsWithSymbol) &&
					hasLaterCloseBeforeNextOpen(lineIndex, afterClose)
				) {
					block.rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
				}
				addBlockSegment(rest.slice(0, close), line);
				finishBlock(true);
				rest = afterClose.trim();
				afterBalancedClose = true;
			}
		}
	}
	finishBlock(false);

	const isOutsideText = (token: OutsideToken): token is OutsideText => token.kind === 'text';

	/**
	 * Одиночный оторванный символ между двумя независимыми вопросами не образует
	 * поддерживаемую структуру вопроса. Более длинный фрагмент остаётся для
	 * строгой проверки: его нельзя молча отбросить как возможную часть stem.
	 */
	const removeDetachedBoundaryDebris = (outside: OutsideToken[]): OutsideToken[] =>
		outside.filter((token, index) => {
			if (token.kind !== 'text' || !token.afterBalancedClose || [...token.line.text].length !== 1) {
				return true;
			}
			const laterText = outside.slice(index + 1).find(isOutsideText);
			if (!laterText) return true;

			return hasNormalLineGap(token.line, laterText.line, maximumQuestionGapRatio);
		});

	interface ResolvedBlockLead {
		lead: QuestionLead;
		rejectionReason?: QuestionRejectionReason;
	}

	/**
	 * Граница вопроса определяется до вывода синтаксиса вариантов: повреждённый
	 * блок не имеет права голосовать за профиль документа.
	 */
	const resolveBlockLead = (
		outside: OutsideToken[],
		currentBlock: BracketBlock,
		allowReadingFlowReindent: boolean,
		isFirstBlock: boolean
	): ResolvedBlockLead => {
		const remaining = removeDetachedBoundaryDebris(outside);
		const lastClose = remaining.findLastIndex(item => item.kind === 'close');
		const tail = remaining.slice(lastClose + 1).filter(isOutsideText);
		const leadLines = tail.map(item => item.line);
		const lead = questionLead(
			leadLines,
			currentBlock.opener,
			maximumQuestionGapRatio,
			allowReadingFlowReindent,
			currentBlock.inlineLead !== ''
		);
		const attachedToPreviousClose =
			currentBlock.inlineLeadAfterBalancedClose ||
			tail.some(item => item.afterBalancedClose && lead.lines.includes(item.line));
		const conflictingVisualBlock = hasConflictingLeadingVisualBlock(
			lead.lines,
			currentBlock.opener,
			currentBlock.inlineLead !== '',
			isFirstBlock
		);

		return {
			lead,
			rejectionReason: attachedToPreviousClose
				? QuestionRejectionReason.MALFORMED_STRUCTURE
				: (lead.rejectionReason ??
					(conflictingVisualBlock ? QuestionRejectionReason.MALFORMED_STRUCTURE : undefined))
		};
	};

	let profileOutside: OutsideToken[] = [];
	let profileBlockIndex = 0;
	for (const token of tokens) {
		if (token.kind !== 'block') {
			profileOutside.push(token);
			continue;
		}

		token.block.rejectionReason ??= resolveBlockLead(
			profileOutside,
			token.block,
			false,
			profileBlockIndex === 0
		).rejectionReason;
		profileBlockIndex++;
		profileOutside = [];
	}

	// Профиль выводится только из явно открытых, явно закрытых и непротиворечивых
	// блоков. Повреждённые области не могут менять синтаксис корректных вопросов.
	const allBlockGroups = tokens.flatMap(token =>
		token.kind === 'block' ? [token.block.segments.map(segment => segment.text)] : []
	);
	const eligibleGroups = (excluded: Set<BracketBlock> = new Set()) =>
		tokens.flatMap(token =>
			token.kind === 'block' &&
			token.block.closed &&
			!token.block.rejectionReason &&
			!excluded.has(token.block)
				? [token.block.segments.map(segment => segment.text)]
				: []
		);
	let syntax = inferOptionSyntax(eligibleGroups(), 1);
	if (!syntax) {
		return inferOptionSyntax(allBlockGroups, 1)
			? { kind: 'untrusted-profile' }
			: { kind: 'not-applicable' };
	}
	const structuralConflicts = (profile: OptionSyntaxProfile): Set<BracketBlock> =>
		new Set(
			tokens.flatMap(token => {
				if (token.kind !== 'block' || token.block.rejectionReason) return [];
				const nestedConflict = token.block.balancedNestedCandidates.some(candidate =>
					parseOptionStart(candidate.text, candidate.line, profile)
				);
				const recoveredOptionStarts = token.block.segments.filter(segment =>
					parseOptionStart(segment.text, segment.line, profile)
				).length;
				const incompleteRecoveredEnvelope =
					token.block.requiresConfirmedOptionEnvelope === true && recoveredOptionStarts < 2;

				return nestedConflict || incompleteRecoveredEnvelope ? [token.block] : [];
			})
		);
	const conflicts = new Set<BracketBlock>();
	while (true) {
		const newlyConflicting = [...structuralConflicts(syntax)].filter(
			candidate => !conflicts.has(candidate)
		);
		if (newlyConflicting.length === 0) break;
		for (const candidate of newlyConflicting) conflicts.add(candidate);
		const refinedSyntax = inferOptionSyntax(eligibleGroups(conflicts), 1);
		if (!refinedSyntax) return { kind: 'untrusted-profile' };
		syntax = refinedSyntax;
	}
	for (const conflictingBlock of conflicts) {
		conflictingBlock.rejectionReason = QuestionRejectionReason.MALFORMED_STRUCTURE;
	}
	const connectedLead = (outside: OutsideText[], nextLine: DocLine): OutsideText[] => {
		const lines: OutsideText[] = [];
		let next = nextLine;
		for (let index = outside.length - 1; index >= 0; index--) {
			const candidate = outside[index];
			const readingFlowBoundary = continuesReadingFlow(candidate.line, next);
			if (
				!hasNormalLineGap(candidate.line, next, maximumQuestionGapRatio) ||
				(readingFlowBoundary && !hasCompatibleLineLayout(candidate.line, nextLine))
			) {
				break;
			}
			lines.unshift(candidate);
			next = candidate.line;
		}

		return lines;
	};
	const hasConnectedLines = (outside: OutsideText[]): boolean => {
		for (let index = 1; index < outside.length; index++) {
			if (
				!hasNormalLineGap(outside[index - 1].line, outside[index].line, maximumQuestionGapRatio)
			) {
				return false;
			}
		}

		return true;
	};

	interface OrphanMatch {
		end: number;
		draft: QuestionDraft;
	}

	const orphanEndingAt = (outside: OutsideToken[], end: number): OrphanMatch | null => {
		if (outside[end]?.kind !== 'close') return null;
		let previousClose = -1;
		for (let index = end - 1; index >= 0; index--) {
			if (outside[index].kind === 'close') {
				previousClose = index;
				break;
			}
		}

		const afterPreviousClose = outside.slice(previousClose + 1, end);
		if (!afterPreviousClose.every(isOutsideText)) return null;
		const firstOption = afterPreviousClose.findIndex(token =>
			parseOptionStart(token.line.text, token.line, syntax)
		);
		if (firstOption < 0) return null;
		const optionTokens = afterPreviousClose.slice(firstOption);
		const optionStarts = optionTokens.filter(token =>
			parseOptionStart(token.line.text, token.line, syntax)
		).length;
		if (optionStarts < 2 || !hasConnectedLines(optionTokens)) return null;

		let leadTokens = connectedLead(afterPreviousClose.slice(0, firstOption), optionTokens[0].line);
		if (leadTokens.length === 0 && previousClose >= 0) {
			let beforeWrongOpen = previousClose - 1;
			while (beforeWrongOpen >= 0 && outside[beforeWrongOpen].kind !== 'close') beforeWrongOpen--;
			const before = outside.slice(beforeWrongOpen + 1, previousClose);
			if (!before.every(isOutsideText)) return null;
			const wrongOpen = outside[previousClose].line;
			if (!hasNormalLineGap(wrongOpen, optionTokens[0].line, maximumQuestionGapRatio)) {
				return null;
			}
			leadTokens = connectedLead(before, wrongOpen);
		}
		if (leadTokens.length === 0 || !hasConnectedLines(leadTokens)) return null;

		return {
			end,
			draft: {
				texts: leadTokens.map(token => token.line.text),
				segments: optionTokens.map(token => ({ text: token.line.text, line: token.line })),
				rejectionReason: QuestionRejectionReason.MALFORMED_STRUCTURE
			}
		};
	};

	const extractOrphans = (
		outside: OutsideToken[]
	): { drafts: QuestionDraft[]; remaining: OutsideToken[] } => {
		const remaining = [...outside];
		const drafts: QuestionDraft[] = [];
		while (true) {
			let match: OrphanMatch | null = null;
			for (let end = 0; end < remaining.length; end++) {
				match = orphanEndingAt(remaining, end);
				if (match) break;
			}
			if (!match) break;
			drafts.push(match.draft);
			// Всё до первого безопасно выделенного malformed-envelope уже находится
			// перед его жёсткой закрывающей границей и не может принадлежать более
			// позднему вопросу. Нераспознанный префикс остаётся межвопросным мусором.
			remaining.splice(0, match.end + 1);
		}

		return { drafts, remaining };
	};

	// Вторая фаза применяет уже подтверждённый профиль: сохраняет однозначные
	// leads, а распознаваемые повреждённые границы материализует в reject.
	const drafts: QuestionDraft[] = [];
	let outside: OutsideToken[] = [];
	let blockIndex = 0;
	for (const token of tokens) {
		if (token.kind !== 'block') {
			outside.push(token);
			continue;
		}

		const extracted = extractOrphans(outside);
		drafts.push(...extracted.drafts);
		const resolvedLead = resolveBlockLead(extracted.remaining, token.block, true, blockIndex === 0);
		blockIndex++;
		const lead = resolvedLead.lead;
		const texts = lead.lines.map(line => line.text.trim());
		if (token.block.inlineLead !== '') texts.push(token.block.inlineLead);
		drafts.push({
			texts,
			segments: token.block.segments,
			rejectionReason:
				token.block.rejectionReason ??
				resolvedLead.rejectionReason ??
				(token.block.closed ? undefined : QuestionRejectionReason.MALFORMED_STRUCTURE)
		});
		outside = [];
	}
	const trailing = extractOrphans(outside);
	drafts.push(...trailing.drafts);

	const questions: RawQuestion[] = drafts.map(draft => {
		const texts = [...draft.texts];
		const options: RawOption[] = [];
		let rejectionReason = draft.rejectionReason;
		for (const segment of draft.segments) {
			const option = parseOptionStart(segment.text, segment.line, syntax);
			if (option) {
				options.push(option);
			} else if (options.length > 0) {
				const previous = options[options.length - 1];
				previous.texts.push(segment.text);
				previous.lines.push(segment.line);
			} else {
				rejectionReason ??= QuestionRejectionReason.MALFORMED_STRUCTURE;
			}
		}

		return { texts, options, rejectionReason };
	});
	return questions.length > 0
		? {
				kind: 'segmented',
				document: { questions, structure: { kind: 'bracket', options: syntax } }
			}
		: { kind: 'untrusted-profile' };
}

/**
 * Схема «двухпрефиксная»: одно символьное семейство открывает вопросы,
 * другое — варианты («? вопрос» / «! вариант» / «!+ правильный»).
 * Строка без токена — продолжение в своём параграфе, иначе игнорируется.
 */
function tryTwoPrefixScheme(lines: DocLine[]): SegmentedDocument | null {
	const heads = lines.map(line => scanSymbolHead(line.text.trim()));
	const families = new Map<string, number>();
	for (const head of heads) {
		if (head) families.set(head.symbols[0], (families.get(head.symbols[0]) ?? 0) + 1);
	}
	if (families.size < 2) return null;

	const isNumericBoundaryFamily = (family: string): boolean =>
		(family === '#' || family === '№') &&
		lines.some(
			(line, index) => scanNumberedQuestionMarker(line.text, index)?.syntax.family === family
		);

	interface TwoPrefixCandidate {
		q: string;
		qIndices: number[];
		questionPrefix: string;
		optionSyntax: OptionSyntaxProfile;
		validGroups: number;
	}

	const candidates: TwoPrefixCandidate[] = [];
	for (const [q] of families) {
		// Числовые `#N`/`№N` являются отдельной нумераторной грамматикой. Если
		// разрешить тому же семейству голосовать как question-prefix, варианты
		// `#1/#2` и границы вопросов станут неразличимы.
		if (isNumericBoundaryFamily(q)) continue;
		const qIndices = heads.flatMap((head, index) => (head?.symbols[0] === q ? [index] : []));
		if (qIndices.length < 2) continue;
		const groups = qIndices.map((start, groupIndex) => {
			const end = qIndices[groupIndex + 1] ?? lines.length;

			return lines.slice(start + 1, end);
		});
		const optionSyntax = inferOptionSyntax(groups.map(group => group.map(line => line.text)));
		if (!optionSyntax) continue;
		optionSyntax.prefixByFamily.delete(q);
		if (optionSyntax.prefixByFamily.size === 0) continue;
		const validGroups = groups.filter(group => {
			let mode: 'question' | 'option' | 'none' = 'question';
			let optionStarts = 0;
			for (const line of group) {
				const family = scanSymbolHead(line.text)?.symbols[0] ?? null;
				if (family !== null && optionSyntax.prefixByFamily.has(family)) {
					if (mode === 'none') return false;
					optionStarts++;
					mode = 'option';
				} else if (mode === 'option' && isParagraphStart(line)) {
					mode = 'none';
				}
			}

			return optionStarts >= 2;
		}).length;
		// Повреждённые вопросы не должны определять профиль, но и не должны
		// уничтожать его целиком: достаточно хотя бы одного непротиворечивого
		// envelope, если само семейство вариантов подтверждено большинством групп.
		if (validGroups === 0) continue;
		const questionPrefix = commonPrefix(
			qIndices.flatMap(index => (heads[index] ? [heads[index]!.symbols] : []))
		);
		if (!questionPrefix) continue;
		candidates.push({ q, qIndices, questionPrefix, optionSyntax, validGroups });
	}
	if (candidates.length === 0) return null;

	// Максимально полно объясняющая документ грамматика сильнее локального
	// совпадения. При равной полноте первая явная граница — единственный
	// структурный способ не принять первый вариант за начало документа.
	const ranked = [...candidates].sort(
		(left, right) => right.validGroups - left.validGroups || left.qIndices[0] - right.qIndices[0]
	);
	const best = ranked[0];
	const optionFamilies = new Set(best.optionSyntax.prefixByFamily.keys());

	// Отдельная пара question/option, не пересекающаяся с выбранным профилем,
	// доказывает наличие конкурирующей грамматики, а не случайного символа.
	const pairCandidates: Array<{ q: string; v: string }> = [];
	for (const [q] of families) {
		if (isNumericBoundaryFamily(q)) continue;
		for (const [v] of families) {
			if (q === v) continue;
			let qCount = 0;
			let sinceQ = -1;
			let valid = true;
			for (const head of heads) {
				const family = head?.symbols[0] ?? null;
				if (family === q) {
					if (sinceQ >= 0 && sinceQ < 2) valid = false;
					qCount++;
					sinceQ = 0;
				} else if (family === v && sinceQ >= 0) {
					sinceQ++;
				}
			}
			if (sinceQ >= 0 && sinceQ < 2) valid = false;
			if (valid && qCount >= 2) pairCandidates.push({ q, v });
		}
	}
	const primaryPairOptions = new Set(
		pairCandidates.filter(candidate => candidate.q === best.q).map(candidate => candidate.v)
	);
	if (
		pairCandidates.some(
			candidate =>
				candidate.q !== best.q &&
				!primaryPairOptions.has(candidate.q) &&
				candidate.v !== best.q &&
				!primaryPairOptions.has(candidate.v)
		)
	) {
		return null;
	}

	// Семейство, способное образовать полноценную вторую question-грамматику,
	// допустимо в option-профиле только как первый вариант каждого envelope.
	// Если оно возникает после уже начавшихся вариантов, роли структурно
	// неразличимы — документ нельзя принимать с произвольным выбором одной из них.
	for (const alternativeFamily of new Set(
		pairCandidates.filter(candidate => candidate.q !== best.q).map(candidate => candidate.q)
	)) {
		const alternativeIndices = heads.flatMap((head, index) =>
			head?.symbols[0] === alternativeFamily ? [index] : []
		);
		for (const index of alternativeIndices) {
			const owner = best.qIndices.findLast(start => start < index);
			if (owner === undefined) return null;
			const previousOption = heads
				.slice(owner + 1, index)
				.some(head => (head ? optionFamilies.has(head.symbols[0]) : false));
			if (optionFamilies.has(alternativeFamily)) {
				if (previousOption) return null;
			} else if (previousOption && isParagraphStart(lines[index])) {
				return null;
			}
		}
	}

	const questionPrefix = best.questionPrefix;
	const optionSyntax = best.optionSyntax;

	const questions: RawQuestion[] = [];
	let current: RawQuestion | null = null;
	let mode: 'question' | 'option' | 'none' = 'none';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const head = heads[i];
		const fam = head ? head.symbols[0] : null;
		if (fam === best.q) {
			if (current) questions.push(current);
			const body = line.text.trim().slice(questionPrefix.length).trim();
			const inline = splitInlineDecoratedOption(body, line, optionSyntax);
			current = {
				texts: [inline?.questionText ?? body],
				options: inline ? [inline.option] : []
			};
			mode = inline ? 'option' : 'question';
		} else if (fam !== null && optionSyntax.prefixByFamily.has(fam) && current) {
			if (mode === 'none') {
				// Возобновление профильных вариантов после постороннего абзаца
				// доказывает повреждение внутренней структуры вопроса. Игнорировать
				// хвост и принимать усечённый вопрос нельзя.
				current.rejectionReason ??= QuestionRejectionReason.MALFORMED_STRUCTURE;
				continue;
			}
			const option = parseOptionStart(line.text, line, optionSyntax);
			if (!option) {
				mode = 'none';
				continue;
			}
			current.options.push(option);
			mode = 'option';
		} else if (current && mode === 'question') {
			const inline = splitInlineDecoratedOption(line.text.trim(), line, optionSyntax);
			if (inline) {
				current.texts.push(inline.questionText);
				current.options.push(inline.option);
				mode = 'option';
			} else {
				current.texts.push(line.text.trim());
			}
		} else if (current && mode === 'option' && !isParagraphStart(line)) {
			const option = current.options[current.options.length - 1];
			option.texts.push(line.text.trim());
			option.lines.push(line);
		} else {
			mode = 'none';
		}
	}
	if (current) questions.push(current);

	return questions.length > 0
		? {
				questions,
				structure: {
					kind: 'two-prefix',
					questionPrefix,
					options: optionSyntax
				}
			}
		: null;
}

interface NumberedQuestionMarker {
	index: number;
	value: number;
	rest: string | null;
	syntax: NumberedQuestionSyntaxProfile;
}

const PREFIXED_NUMBER_RE = /^([#№])\s*(\d+)\s*([.):\]]?)(?:\s+(\S.*))?$/;
const BARE_NUMBER_RE = /^(\d+)\s*([.):\]])(?:\s+(\S.*))?$/;

function scanNumberedQuestionMarker(text: string, index: number): NumberedQuestionMarker | null {
	const prefixed = PREFIXED_NUMBER_RE.exec(text.trim());
	if (prefixed) {
		const rest = prefixed[4] ?? null;

		return {
			index,
			value: Number(prefixed[2]),
			rest,
			syntax: {
				family: prefixed[1] as '#' | '№',
				terminator: prefixed[3] as NumberedQuestionMarkerTerminator,
				placement: rest === null ? 'standalone' : 'inline'
			}
		};
	}

	const bare = BARE_NUMBER_RE.exec(text.trim());
	if (!bare) return null;
	const rest = bare[3] ?? null;

	return {
		index,
		value: Number(bare[1]),
		rest,
		syntax: {
			family: 'bare',
			terminator: bare[2] as NumberedQuestionMarkerTerminator,
			placement: rest === null ? 'standalone' : 'inline'
		}
	};
}

const numberedSyntaxKey = (syntax: NumberedQuestionSyntaxProfile): string =>
	`${syntax.family}\u0000${syntax.terminator}\u0000${syntax.placement}`;

function inferNumberedQuestionSyntax(
	markers: NumberedQuestionMarker[],
	lines: DocLine[]
): { profile: NumberedQuestionSyntaxProfile; starters: NumberedQuestionMarker[] } | null {
	const candidates = new Map<
		string,
		{ profile: NumberedQuestionSyntaxProfile; starters: NumberedQuestionMarker[]; support: number }
	>();
	for (const marker of markers) {
		const key = numberedSyntaxKey(marker.syntax);
		if (candidates.has(key)) continue;
		const starters = markers.filter(current => numberedSyntaxKey(current.syntax) === key);
		if (starters.length < 2) continue;
		const support = starters.filter((starter, index) => {
			const end = starters[index + 1]?.index ?? lines.length;

			return hasCompleteNumberedEnvelope(lines, starter, end);
		}).length;
		if (support > starters.length / 2) {
			candidates.set(key, { profile: marker.syntax, starters, support });
		}
	}
	const ranked = [...candidates.values()].sort((left, right) => right.support - left.support);
	const [confirmed, ...competing] = ranked;
	if (
		!confirmed ||
		confirmed.support <= competing.reduce((sum, candidate) => sum + candidate.support, 0)
	) {
		return null;
	}

	return { profile: confirmed.profile, starters: confirmed.starters };
}

function parseNumberedEnvelope(
	lines: DocLine[],
	starter: NumberedQuestionMarker,
	end: number
): { texts: string[]; options: RawOption[] } {
	const texts: string[] = starter.rest ? [starter.rest] : [];
	const options: RawOption[] = [];
	let inQuestion = true;
	for (let index = starter.index + 1; index < end; index++) {
		const line = lines[index];
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

	return { texts, options };
}

function hasCompleteNumberedEnvelope(
	lines: DocLine[],
	starter: NumberedQuestionMarker,
	end: number
): boolean {
	const envelope = parseNumberedEnvelope(lines, starter, end);

	return envelope.texts.some(text => text !== '') && envelope.options.length >= 2;
}

/**
 * Схема «нумераторная»: вопросы открываются номером-меткой («#1», «2.»,
 * «3) текст…»). Первый параграф после номера — текст вопроса, каждый следующий
 * параграф — вариант. Преамбула до первого номера отбрасывается.
 *
 * Числовые значения не определяют структуру: документ может начинаться с любого
 * номера, содержать пропуски, повторы и ошибки PDF-кодировки. Профиль выбирается
 * по единой лексической форме границ и по тому, образуют ли они полноценные
 * question-envelope с текстом и вариантами.
 */
function tryNumberedScheme(lines: DocLine[]): SegmentedDocument | null {
	const markers = lines.flatMap((line, index) => {
		const marker = scanNumberedQuestionMarker(line.text, index);

		return marker ? [marker] : [];
	});
	const inferred = inferNumberedQuestionSyntax(markers, lines);
	if (!inferred) return null;
	const { profile: questionSyntax, starters } = inferred;

	const questions: RawQuestion[] = [];
	for (let s = 0; s < starters.length; s++) {
		const { index } = starters[s];
		const end = s + 1 < starters.length ? starters[s + 1].index : lines.length;
		const { texts, options } = parseNumberedEnvelope(lines, starters[s], end);
		const hasConflictingBoundary = markers.some(marker => {
			if (
				marker.index <= index ||
				marker.index >= end ||
				numberedSyntaxKey(marker.syntax) === numberedSyntaxKey(questionSyntax)
			) {
				return false;
			}

			// Другая форма того же явного `#`/`№` — повреждённая граница
			// выбранного профиля. Числовая строка иной семьи может быть обычным
			// вариантом ответа; конфликтом она становится только когда сама
			// образует полноценный question-envelope до следующей границы той же
			// альтернативной формы (либо до следующей границы профиля).
			const markerKey = numberedSyntaxKey(marker.syntax);
			const nextSameAlternative = markers.find(
				candidate =>
					candidate.index > marker.index &&
					candidate.index < end &&
					numberedSyntaxKey(candidate.syntax) === markerKey
			);

			return (
				(marker.syntax.family === questionSyntax.family && questionSyntax.family !== 'bare') ||
				hasCompleteNumberedEnvelope(lines, marker, nextSameAlternative?.index ?? end)
			);
		});
		questions.push({
			texts,
			options,
			rejectionReason: hasConflictingBoundary
				? QuestionRejectionReason.MALFORMED_STRUCTURE
				: undefined
		});
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

	return {
		questions,
		structure: { kind: 'numbered', question: questionSyntax, options: syntax }
	};
}

/**
 * Сегментация строк документа на вопросы и варианты. Схемы пробуются от самого
 * сильного структурного сигнала к более слабому; null — структура не распознана.
 */
export function segmentQuestions(lines: DocLine[]): SegmentedDocument | null {
	const bracket = tryBracketScheme(lines);
	if (bracket.kind === 'segmented') return bracket.document;
	if (bracket.kind === 'untrusted-profile') return null;

	return tryTwoPrefixScheme(lines) ?? tryNumberedScheme(lines);
}
