import { DocLine } from '../types/document-model';

/** Вариант ответа до сборки: символьный маркер-префикс (если был) отделён от текста. */
export interface RawOption {
	token: string | null;
	texts: string[];
	lines: DocLine[];
}

/** Вопрос до сборки: строки текста вопроса и его варианты. */
export interface RawQuestion {
	texts: string[];
	options: RawOption[];
}

/**
 * Ведущий символьный токен строки: последовательность небуквенных маркерных
 * символов, за которой следует содержимое («= текст», «!+ текст», «~текст»).
 */
const TOKEN_RE = /^\s*([~=+!?*•·◦▪‣✓✔√×<>#@&$%|/\\-]{1,4})(?=[\s0-9A-Za-zА-Яа-яЁё«"'“‘([])/;

function matchToken(text: string): { token: string; rest: string } | null {
	const m = TOKEN_RE.exec(text);
	if (!m) return null;

	return { token: m[1], rest: text.slice(m.index + m[0].length).trim() };
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

	const questions: RawQuestion[] = [];
	let tail: DocLine[] = [];
	let inBlock = false;
	let qTexts: string[] = [];
	let options: RawOption[] = [];

	const closeBlock = () => {
		if (qTexts.length > 0 || options.length > 0) questions.push({ texts: qTexts, options });
		qTexts = [];
		options = [];
		inBlock = false;
	};

	const addBlockSegment = (raw: string, line: DocLine) => {
		const text = raw.trim();
		if (text === '') return;
		const tok = matchToken(text);
		if (tok) {
			options.push({ token: tok.token, texts: [tok.rest], lines: [line] });
		} else if (options.length > 0) {
			const last = options[options.length - 1];
			last.texts.push(text);
			last.lines.push(line);
		} else {
			qTexts.push(text);
		}
	};

	const openBlock = (before: string, line: DocLine) => {
		const paragraph = before !== '' && isParagraphStart(line) ? [] : lastParagraph(tail);
		qTexts = paragraph.map(l => l.text.trim());
		if (before !== '') qTexts.push(before);
		tail = [];
		options = [];
		inBlock = true;
	};

	for (const line of lines) {
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
				if (close < 0) {
					addBlockSegment(rest, line);
					break;
				}
				addBlockSegment(rest.slice(0, close), line);
				closeBlock();
				rest = rest.slice(close + 1);
				consumedOnLine = true;
			}
		}
	}
	if (inBlock) closeBlock();

	return questions.length > 0 ? questions : null;
}

/**
 * Схема «двухпрефиксная»: одно символьное семейство открывает вопросы,
 * другое — варианты («? вопрос» / «! вариант» / «!+ правильный»).
 * Строка без токена — продолжение в своём параграфе, иначе игнорируется.
 */
function tryTwoPrefixScheme(lines: DocLine[]): RawQuestion[] | null {
	const tokens = lines.map(l => matchToken(l.text.trim()));
	const families = new Map<string, number>();
	for (const tok of tokens) {
		if (tok) families.set(tok.token[0], (families.get(tok.token[0]) ?? 0) + 1);
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
			for (const tok of tokens) {
				const fam = tok ? tok.token[0] : null;
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

	const questions: RawQuestion[] = [];
	let current: RawQuestion | null = null;
	let mode: 'question' | 'option' | 'none' = 'none';
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const tok = tokens[i];
		const fam = tok ? tok.token[0] : null;
		if (fam === best.q) {
			if (current) questions.push(current);
			current = { texts: [tok.rest], options: [] };
			mode = 'question';
		} else if (fam === best.v && current) {
			current.options.push({ token: tok.token, texts: [tok.rest], lines: [line] });
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
				options.push({ token: null, texts: [line.text.trim()], lines: [line] });
			} else {
				const option = options[options.length - 1];
				option.texts.push(line.text.trim());
				option.lines.push(line);
			}
		}
		questions.push({ texts, options });
	}

	// Если большинство вариантов всё же несёт символьный префикс — отделяем его.
	const allOptions = questions.flatMap(q => q.options);
	const optionTokens = allOptions.map(o => matchToken(o.texts[0] ?? ''));
	const tokenized = optionTokens.filter(Boolean).length;
	if (allOptions.length > 0 && tokenized >= allOptions.length * 0.6) {
		allOptions.forEach((option, i) => {
			const tok = optionTokens[i];
			if (tok) {
				option.token = tok.token;
				option.texts[0] = tok.rest;
			}
		});
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
