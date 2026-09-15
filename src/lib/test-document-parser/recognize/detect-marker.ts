import { HighlightSourceKind } from '../types/document-model';
import { RawOption, RawQuestion } from './segment';

/** Один подтверждаемый документный способ выделения правильного варианта. */
export type AnswerMarkerSignal =
	| { kind: 'symbol'; prefix: string }
	| {
			kind: 'highlight';
			minimumSpanEm: number;
			/** null — legacy IR без идентичности источников; иначе подтверждённые виды. */
			sourceKinds: HighlightSourceKind[] | null;
	  }
	| { kind: 'bold'; threshold: number }
	| { kind: 'italic'; threshold: number }
	| { kind: 'color'; value: string };

/**
 * Документный профиль правильного ответа. Каждый сигнал независимо подтверждён
 * на документе. В отдельном вопросе отсутствующий сигнал допустим, но все
 * присутствующие сигналы обязаны указывать на один и тот же набор ответов.
 */
export interface AnswerMarkerProfile {
	signals: AnswerMarkerSignal[];
	/**
	 * Группы сигналов, каждая из которых достаточна для выбора ответа. Сигналы,
	 * которые расходились на документе, входят в одну группу и могут применяться
	 * только совместно. Для профилей старого формата все сигналы образуют одну
	 * обязательную группу.
	 */
	selectorGroups?: [number, ...number[]][];
	/** Подтверждённый символьный префикс, который можно удалить из текста. */
	symbolPrefix: string | null;
}

export interface AppliedAnswerMarker {
	marked: boolean[];
	ambiguous: boolean;
	consumedTextPrefixes: (string | null)[];
}

/** Ровно половины недостаточно: формат подтверждает только строгое большинство. */
const hasStrictMajority = (count: number, total: number) => count > total / 2;

/** Агрегированные визуальные свойства варианта (по всем его строкам). */
interface OptionStyle {
	sourcePrefix: string | null;
	structuralPrefix: string | null;
	hasTextAfterSourcePrefix: boolean;
	hasTextAfterStructuralPrefix: boolean;
	/** Максимальная длина выделения одной строки в единицах размера шрифта. */
	highlightSpanEm: number;
	/** Максимальная доля ширины одной строки, занятая выделением. */
	highlightCoverage: number;
	/** Максимально видимый след, включая тонкое нестабильное пересечение. */
	highlightVisibleSpanEm: number;
	highlightVisibleCoverage: number;
	/** Покрытие варианта каждым самостоятельным визуальным маркером. */
	highlightSources: Map<
		string,
		{
			kind: HighlightSourceKind;
			spanEm: number;
			coverage: number;
			visibleSpanEm: number;
			visibleCoverage: number;
		}
	>;
	/** Экстрактор гарантировал идентичность каждого визуального источника. */
	highlightSourcesKnown: boolean;
	highlightAmbiguous: boolean;
	bold: number;
	italic: number;
	color: string | null;
}

function styleOf(option: RawOption): OptionStyle {
	let width = 0;
	let highlightSpanEm = 0;
	let highlightCoverage = 0;
	let highlightVisibleSpanEm = 0;
	let highlightVisibleCoverage = 0;
	const highlightSources = new Map<
		string,
		{
			kind: HighlightSourceKind;
			spanEm: number;
			coverage: number;
			visibleSpanEm: number;
			visibleCoverage: number;
		}
	>();
	let highlightAmbiguous = false;
	let bold = 0;
	let italic = 0;
	const colors = new Map<string, number>();
	for (const line of option.lines) {
		const w = Math.max(1, line.x1 - line.x0);
		width += w;
		const lineWidth = Math.max(0, line.x1 - line.x0);
		const fontSize = Math.max(0.1, line.size);
		highlightSpanEm = Math.max(highlightSpanEm, (line.highlightFrac * lineWidth) / fontSize);
		highlightCoverage = Math.max(highlightCoverage, line.highlightFrac);
		const lineVisibleFraction = line.highlightVisibleFrac ?? line.highlightFrac;
		highlightVisibleSpanEm = Math.max(
			highlightVisibleSpanEm,
			(lineVisibleFraction * lineWidth) / fontSize
		);
		highlightVisibleCoverage = Math.max(highlightVisibleCoverage, lineVisibleFraction);
		for (const source of line.highlightSources ?? []) {
			const sourceKindFromId = source.id.split(':')[1];
			const kind =
				source.kind ??
				(sourceKindFromId === 'annotation' ||
				sourceKindFromId === 'image' ||
				sourceKindFromId === 'path'
					? sourceKindFromId
					: 'unknown');
			const current = highlightSources.get(source.id) ?? {
				kind,
				spanEm: 0,
				coverage: 0,
				visibleSpanEm: 0,
				visibleCoverage: 0
			};
			const visibleFraction = source.visibleFraction ?? source.fraction;
			current.spanEm = Math.max(current.spanEm, (source.fraction * lineWidth) / fontSize);
			current.coverage = Math.max(current.coverage, source.fraction);
			current.visibleSpanEm = Math.max(
				current.visibleSpanEm,
				(visibleFraction * lineWidth) / fontSize
			);
			current.visibleCoverage = Math.max(current.visibleCoverage, visibleFraction);
			highlightSources.set(source.id, current);
		}
		highlightAmbiguous ||= line.highlightAmbiguous ?? false;
		bold += line.boldFrac * w;
		italic += line.italicFrac * w;
		if (line.color) colors.set(line.color, (colors.get(line.color) ?? 0) + w);
	}
	let color: string | null = null;
	let best = 0;
	for (const [c, w] of colors) {
		if (w > best) {
			best = w;
			color = c;
		}
	}

	return {
		sourcePrefix: option.sourcePrefix,
		structuralPrefix: option.structuralPrefix,
		hasTextAfterSourcePrefix: option.hasTextAfterSourcePrefix,
		hasTextAfterStructuralPrefix: option.texts.some(text => text.trim() !== ''),
		highlightSpanEm,
		highlightCoverage,
		highlightVisibleSpanEm,
		highlightVisibleCoverage,
		highlightSources,
		highlightSourcesKnown: option.lines.every(line => line.highlightSources !== undefined),
		highlightAmbiguous,
		bold: width > 0 ? bold / width : 0,
		italic: width > 0 ? italic / width : 0,
		color
	};
}

/** Разметка по булеву предикату: помечает варианты, для которых он истинен. */
interface SignalMarking {
	sets: boolean[][];
	ambiguous: boolean[];
}

function markByPredicate(
	styles: OptionStyle[][],
	test: (s: OptionStyle) => boolean
): SignalMarking {
	return { sets: styles.map(qs => qs.map(test)), ambiguous: styles.map(() => false) };
}

/**
 * Каждый вариант оценивается независимо: подтверждённый визуальный маркер не
 * становится менее правильным из-за более длинного выделения у соседа. Слабое
 * пересечение между уровнем геометрического шума и достаточным маркером нельзя
 * однозначно классифицировать — весь вопрос помечается неоднозначным.
 */
function markByHighlight(
	styles: OptionStyle[][],
	minimumSpanEm: number,
	sourceKinds: HighlightSourceKind[] | null
): SignalMarking {
	// Половина em соответствует примерно ширине одного обычного глифа. Только
	// почти полное покрытие короткого узкого ответа (например «I») компенсирует
	// меньшую физическую длину. Между субглифовым затёком и достаточным маркером
	// остаётся зона неоднозначности, измеряемая и относительно текста, и в em.
	const clearlyCoveredFraction = 0.9;
	const visibleFraction = 0.1;
	const visibleSpanEm = minimumSpanEm / 4;
	const maximumSpillSpanEm = (minimumSpanEm * 2) / 3;
	const isMarkedEvidence = (spanEm: number, coverage: number) =>
		spanEm >= minimumSpanEm || coverage >= clearlyCoveredFraction;
	const isVisibleEvidence = (spanEm: number, coverage: number) =>
		spanEm >= visibleSpanEm || coverage >= visibleFraction;
	const isNegligibleSpill = (spanEm: number, coverage: number) =>
		spanEm < maximumSpillSpanEm && coverage < visibleFraction;
	// Если одна связная область пересекает несколько вариантов, одного короткого
	// фрагмента в каждом уже недостаточно: это может быть как намеренное общее
	// выделение, так и неточный широкий мазок. Однозначную принадлежность всему
	// набору доказывает только устойчивое покрытие большей части каждого варианта.
	// Относительная доля не зависит от кегля, DPI и абсолютной геометрии PDF.
	const clearlyOwnsSharedSource = (coverage: number) => coverage > 0.5;
	const includesSource = (kind: HighlightSourceKind) =>
		sourceKinds === null || sourceKinds.includes(kind);
	const relevantSources = (style: OptionStyle) =>
		[...style.highlightSources].filter(([, evidence]) => includesSource(evidence.kind));
	const hasDecisiveSource = (style: OptionStyle) =>
		relevantSources(style).some(([, evidence]) =>
			isMarkedEvidence(evidence.spanEm, evidence.coverage)
		);
	const isMarked = (style: OptionStyle) =>
		style.highlightSourcesKnown && sourceKinds !== null
			? hasDecisiveSource(style)
			: isMarkedEvidence(style.highlightSpanEm, style.highlightCoverage);
	const isVisible = (style: OptionStyle) => {
		if (!style.highlightSourcesKnown || sourceKinds === null) {
			return isVisibleEvidence(style.highlightVisibleSpanEm, style.highlightVisibleCoverage);
		}

		return relevantSources(style).some(([, evidence]) =>
			isVisibleEvidence(evidence.visibleSpanEm, evidence.visibleCoverage)
		);
	};

	return {
		sets: styles.map(qs => qs.map(isMarked)),
		ambiguous: styles.map(qs => {
			const owners = new Map<string, Set<number>>();
			for (let optionIndex = 0; optionIndex < qs.length; optionIndex++) {
				for (const [sourceId, evidence] of relevantSources(qs[optionIndex])) {
					if (!isMarkedEvidence(evidence.spanEm, evidence.coverage)) continue;
					const sourceOwners = owners.get(sourceId) ?? new Set<number>();
					sourceOwners.add(optionIndex);
					owners.set(sourceId, sourceOwners);
				}
			}
			for (const [sourceId, sourceOwners] of owners) {
				if (sourceOwners.size <= 1) continue;
				if (
					[...sourceOwners].some(optionIndex => {
						const evidence = qs[optionIndex].highlightSources.get(sourceId);

						return !evidence || !clearlyOwnsSharedSource(evidence.coverage);
					})
				) {
					return true;
				}
			}
			// Неизвестный композит внутри уже независимо подтверждённого маркера не
			// способен изменить выбор варианта: достаточная видимая часть выделения
			// существует вне спорной области. На непомеченном варианте та же
			// неопределённость могла скрывать самостоятельный маркер — это reject.
			if (qs.some(style => style.highlightAmbiguous && !isMarked(style))) return true;

			for (let optionIndex = 0; optionIndex < qs.length; optionIndex++) {
				const style = qs[optionIndex];
				if (!isVisible(style) || isMarked(style)) continue;
				// Малый хвост уже однозначно назначенного соседнего маркера — не
				// самостоятельная пометка. Без точной идентичности источника такое
				// пересечение остаётся неоднозначным.
				const visibleSources = relevantSources(style).filter(([, evidence]) =>
					isVisibleEvidence(evidence.visibleSpanEm, evidence.visibleCoverage)
				);
				const explainedSpill =
					style.highlightSourcesKnown &&
					visibleSources.length > 0 &&
					visibleSources.every(([sourceId, evidence]) => {
						const sourceOwners = owners.get(sourceId);

						return (
							isNegligibleSpill(evidence.visibleSpanEm, evidence.visibleCoverage) &&
							sourceOwners?.size === 1 &&
							!sourceOwners.has(optionIndex)
						);
					});
				if (!explainedSpill) return true;
			}

			return false;
		})
	};
}

/**
 * Кандидат-признак: его разметка и метрики отбора. Оценка ПО-ВОПРОСНАЯ: вопрос,
 * где признак пометил ноль или сразу все варианты, он не РАЗЛИЧАЕТ — такой
 * вопрос не участвует в выборе признака, но сам признак кандидатом остаётся
 * (одна аномалия не должна выбивать маркер на всех остальных вопросах).
 */
interface Candidate {
	sets: boolean[][];
	ambiguous: boolean[];
	signal: AnswerMarkerSignal;
	/** Число вопросов, где признак различает ответ (помечено 1..n-1 вариантов). */
	coverage: number;
	/** Число вопросов, где признак присутствует (помечен хотя бы один вариант). */
	conforming: number;
	/** Средняя доля помеченных вариантов среди различённых вопросов. */
	avgFraction: number;
}

function toCandidate(
	marking: SignalMarking,
	evaluationIndices: number[],
	signal: AnswerMarkerSignal
): Candidate {
	let coverage = 0;
	let conforming = 0;
	let fractionSum = 0;
	for (const questionIndex of evaluationIndices) {
		if (marking.ambiguous[questionIndex]) continue;
		const qs = marking.sets[questionIndex];
		const count = qs.filter(Boolean).length;
		if (count >= 1) conforming++;
		if (count >= 1 && count < qs.length) {
			coverage++;
			fractionSum += count / qs.length;
		}
	}

	return {
		sets: marking.sets,
		ambiguous: marking.ambiguous,
		signal,
		coverage,
		conforming,
		avgFraction: coverage > 0 ? fractionSum / coverage : 1
	};
}

function markBySignal(styles: OptionStyle[][], signal: AnswerMarkerSignal): SignalMarking {
	switch (signal.kind) {
		case 'symbol':
			return markByPredicate(
				styles,
				style => style.sourcePrefix !== null && style.sourcePrefix.startsWith(signal.prefix)
			);
		case 'highlight':
			return markByHighlight(styles, signal.minimumSpanEm, signal.sourceKinds);
		case 'bold':
			return markByPredicate(styles, style => style.bold >= signal.threshold);
		case 'italic':
			return markByPredicate(styles, style => style.italic >= signal.threshold);
		case 'color':
			return markByPredicate(styles, style => style.color === signal.value);
	}
}

const questionSignature = (qs: boolean[]) => qs.map(b => (b ? '1' : '0')).join('');

/**
 * Строит документный профиль признаков правильного ответа. Каждый кандидат
 * сначала должен однозначно сработать в строгом большинстве оцениваемых
 * вопросов. Символ и фоновое выделение считаются явными признаками; если они
 * конфликтуют, вопрос принимается только при совместном согласии. Более слабый
 * подтверждённый признак не выбирает ответ самостоятельно, но запрещает принять
 * локальный конфликт. Для условных признаков оформления сохраняется защита от
 * комплементарного большинства. Фоновое выделение подтверждается только там,
 * где оно различает варианты; после подтверждения отдельный вопрос может иметь
 * выделенными и все варианты.
 */
export function inferAnswerMarkerProfile(
	questions: RawQuestion[],
	evaluationIndices: number[]
): AnswerMarkerProfile | null {
	const styles = questions.map(q => q.options.map(styleOf));
	if (styles.length === 0 || evaluationIndices.length === 0) return null;

	const symbolPrefixes = new Set<string>();
	const colors = new Set<string>();
	const highlightSourceKinds = new Set<HighlightSourceKind>();
	let needsGenericHighlight = false;
	for (const questionIndex of evaluationIndices) {
		const qs = styles[questionIndex];
		for (const s of qs) {
			if (s.structuralPrefix && s.hasTextAfterStructuralPrefix) {
				symbolPrefixes.add(s.structuralPrefix);
			}
			if (s.sourcePrefix && s.hasTextAfterSourcePrefix) symbolPrefixes.add(s.sourcePrefix);
			if (s.color) colors.add(s.color);
			if (!s.highlightSourcesKnown) needsGenericHighlight = true;
			for (const evidence of s.highlightSources.values()) {
				highlightSourceKinds.add(evidence.kind);
			}
		}
	}

	const candidates: Candidate[] = [];
	for (const symbolPrefix of symbolPrefixes) {
		const signal: AnswerMarkerSignal = { kind: 'symbol', prefix: symbolPrefix };
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}
	for (const sourceKind of highlightSourceKinds) {
		const signal: AnswerMarkerSignal = {
			kind: 'highlight',
			minimumSpanEm: 0.5,
			sourceKinds: [sourceKind]
		};
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}
	for (const signal of [
		...(needsGenericHighlight
			? ([{ kind: 'highlight', minimumSpanEm: 0.5, sourceKinds: null }] as const)
			: []),
		{ kind: 'bold', threshold: 0.55 },
		{ kind: 'italic', threshold: 0.55 }
	] satisfies AnswerMarkerSignal[]) {
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}
	for (const color of colors) {
		const signal: AnswerMarkerSignal = { kind: 'color', value: color };
		candidates.push(toCandidate(markBySignal(styles, signal), evaluationIndices, signal));
	}

	// Фоновый маркер сам задаёт положительное направление и не обязан отмечать
	// меньшинство вариантов. Но профиль он подтверждает только вопросами, где
	// реально различает 1..n-1 вариантов: сплошная декоративная заливка не marker.
	// Для условных сигналов оформления сохраняется дополнительная защита от
	// выбора комплементарного большинства.
	const usable = candidates.filter(
		candidate =>
			candidate.coverage >= 1 &&
			(candidate.signal.kind === 'highlight' || candidate.avgFraction <= 0.5)
	);
	const documentCandidates = usable.filter(candidate =>
		hasStrictMajority(candidate.coverage, evaluationIndices.length)
	);
	if (documentCandidates.length === 0) return null;
	const explicitIndices = documentCandidates.flatMap((candidate, index) =>
		candidate.signal.kind === 'symbol' || candidate.signal.kind === 'highlight' ? [index] : []
	);
	const primaryIndices =
		explicitIndices.length > 0
			? explicitIndices
			: (() => {
					const maxCoverage = Math.max(...documentCandidates.map(candidate => candidate.coverage));

					return documentCandidates.flatMap((candidate, index) =>
						candidate.coverage === maxCoverage ? [index] : []
					);
				})();
	const consensusOf = (indices: number[], questionIndex: number): boolean[] | null => {
		if (indices.some(index => documentCandidates[index].ambiguous[questionIndex])) return null;
		const active = indices
			.map(index => documentCandidates[index].sets[questionIndex])
			.filter(question => question.some(Boolean));
		if (active.length === 0) return null;
		const distinct = new Set(active.map(questionSignature));

		return distinct.size === 1 ? active[0] : null;
	};

	const signalsConflict = (left: Candidate, right: Candidate, questionIndex: number): boolean => {
		if (left.ambiguous[questionIndex] || right.ambiguous[questionIndex]) return false;
		const leftSet = left.sets[questionIndex];
		const rightSet = right.sets[questionIndex];

		return (
			leftSet.some(Boolean) &&
			rightSet.some(Boolean) &&
			questionSignature(leftSet) !== questionSignature(rightSet)
		);
	};

	// Любой структурно правдоподобный сигнал, присутствующий в большинстве
	// документа, остаётся в профиле. Более слабый кандидат, обычно совпадающий с
	// ведущим, работает как локальный veto при конфликте, но его отсутствие не
	// блокирует ведущий. Несогласованный сильный конкурент требует совместного
	// консенсуса: без смысла нельзя решить, фон это или реальный маркер ответа.
	const confirmed = documentCandidates;
	const corroboratingIndices: number[] = [];
	const challengerIndices: number[] = [];
	for (let candidateIndex = 0; candidateIndex < confirmed.length; candidateIndex++) {
		if (primaryIndices.includes(candidateIndex)) continue;
		let agreements = 0;
		let conflicts = 0;
		for (const questionIndex of evaluationIndices) {
			if (confirmed[candidateIndex].ambiguous[questionIndex]) continue;
			const primarySet = consensusOf(primaryIndices, questionIndex);
			const current = confirmed[candidateIndex].sets[questionIndex];
			if (!primarySet || !current.some(Boolean)) continue;
			if (questionSignature(primarySet) === questionSignature(current)) agreements++;
			else conflicts++;
		}
		if (conflicts === 0 && hasStrictMajority(agreements, confirmed[candidateIndex].conforming)) {
			corroboratingIndices.push(candidateIndex);
		} else if (conflicts > 0 && !hasStrictMajority(agreements, evaluationIndices.length)) {
			challengerIndices.push(candidateIndex);
		}
	}

	const selectorGroups: [number, ...number[]][] = [];
	const primaryConflict = primaryIndices.some((left, leftOffset) =>
		primaryIndices
			.slice(leftOffset + 1)
			.some(right =>
				evaluationIndices.some(questionIndex =>
					signalsConflict(confirmed[left], confirmed[right], questionIndex)
				)
			)
	);
	const selectorIndices = [...new Set([...primaryIndices, ...challengerIndices])].sort(
		(left, right) => left - right
	);
	const ungrouped = new Set(selectorIndices);
	for (const rootIndex of selectorIndices) {
		if (!ungrouped.delete(rootIndex)) continue;
		const component: [number, ...number[]] = [rootIndex];
		for (let cursor = 0; cursor < component.length; cursor++) {
			for (const candidateIndex of [...ungrouped]) {
				const conflicts = evaluationIndices.some(questionIndex =>
					signalsConflict(confirmed[component[cursor]], confirmed[candidateIndex], questionIndex)
				);
				if (!conflicts) continue;
				ungrouped.delete(candidateIndex);
				component.push(candidateIndex);
			}
		}
		selectorGroups.push(component);
	}
	selectorGroups.push(...corroboratingIndices.map(index => [index] as [number]));
	selectorGroups.sort((left, right) => left[0] - right[0]);

	const textConsumingIndices = new Set([
		...corroboratingIndices,
		...(!primaryConflict && challengerIndices.length === 0 ? primaryIndices : [])
	]);
	const confirmedSymbolIndices = confirmed.flatMap((candidate, index) =>
		candidate.signal.kind === 'symbol' ? [index] : []
	);
	// Локальный конфликт не отменяет уже подтверждённую лексику всего документа.
	// Единственный символьный кандидат можно продолжать удалять в согласованных
	// вопросах, если другой независимо подтверждённый способ выбора указывает на
	// тот же непустой и неполный набор в строгом большинстве документа. Сам
	// конфликтующий вопрос всё равно будет отклонён ниже и ничего не потеряет.
	if (confirmedSymbolIndices.length === 1) {
		const [symbolIndex] = confirmedSymbolIndices;
		const corroboratedAcrossDocument = confirmed.some((candidate, candidateIndex) => {
			if (candidateIndex === symbolIndex) return false;
			let agreements = 0;
			for (const questionIndex of evaluationIndices) {
				if (confirmed[symbolIndex].ambiguous[questionIndex] || candidate.ambiguous[questionIndex]) {
					continue;
				}
				const symbolSet = confirmed[symbolIndex].sets[questionIndex];
				const candidateSet = candidate.sets[questionIndex];
				const symbolCount = symbolSet.filter(Boolean).length;
				const candidateCount = candidateSet.filter(Boolean).length;
				if (
					symbolCount === 0 ||
					symbolCount === symbolSet.length ||
					candidateCount === 0 ||
					candidateCount === candidateSet.length
				) {
					continue;
				}
				if (questionSignature(symbolSet) === questionSignature(candidateSet)) agreements++;
			}

			return hasStrictMajority(agreements, evaluationIndices.length);
		});
		if (corroboratedAcrossDocument) textConsumingIndices.add(symbolIndex);
	}
	const symbolCandidates = confirmed
		.flatMap((candidate, index) =>
			textConsumingIndices.has(index) && candidate.signal.kind === 'symbol'
				? [candidate as Candidate & { signal: { kind: 'symbol'; prefix: string } }]
				: []
		)
		.sort(
			(a, b) =>
				b.coverage - a.coverage ||
				a.signal.prefix.length - b.signal.prefix.length ||
				a.signal.prefix.localeCompare(b.signal.prefix)
		);
	const symbolPrefix = symbolCandidates[0]?.signal.prefix ?? null;

	return {
		signals: confirmed.map(candidate => candidate.signal),
		selectorGroups,
		symbolPrefix
	};
}

function confirmedSymbolMarker(
	option: RawOption,
	symbolPrefix: string | null
): { matches: boolean; consumedTextPrefix: string | null } {
	if (
		!symbolPrefix ||
		!option.structuralPrefix ||
		!symbolPrefix.startsWith(option.structuralPrefix)
	) {
		return { matches: false, consumedTextPrefix: null };
	}

	const remainder = symbolPrefix.slice(option.structuralPrefix.length);
	const contiguous = option.sourcePrefix?.startsWith(symbolPrefix) ?? false;
	// Раздельная запись сама профиль не подтверждает. После подтверждения
	// `=+answer` и `= +answer` являются одной формой составного маркера.
	const separatedByWhitespace =
		remainder !== '' &&
		option.sourcePrefix === option.structuralPrefix &&
		option.texts[0]?.startsWith(remainder);
	const matches = contiguous || separatedByWhitespace;

	return {
		matches,
		consumedTextPrefix:
			matches && remainder !== '' && option.texts[0]?.startsWith(remainder) ? remainder : null
	};
}

/** Применяет уже зафиксированный профиль, ничего заново не выбирая. */
export function applyAnswerMarkerProfile(
	question: RawQuestion,
	profile: AnswerMarkerProfile
): AppliedAnswerMarker {
	const styles = [question.options.map(styleOf)];
	const confirmedHighlightKinds = new Set(
		profile.signals.flatMap(signal =>
			signal.kind === 'highlight' && signal.sourceKinds !== null ? signal.sourceKinds : []
		)
	);
	const hasGenericHighlight = profile.signals.some(
		signal => signal.kind === 'highlight' && signal.sourceKinds === null
	);
	const hasForeignHighlightSource =
		!hasGenericHighlight &&
		confirmedHighlightKinds.size > 0 &&
		styles[0].some(style =>
			[...style.highlightSources.values()].some(
				evidence =>
					!confirmedHighlightKinds.has(evidence.kind) &&
					(evidence.visibleSpanEm >= 0.125 || evidence.visibleCoverage >= 0.1)
			)
		);
	const confirmedSymbols = question.options.map(option =>
		confirmedSymbolMarker(option, profile.symbolPrefix)
	);
	const markings = profile.signals.map(signal => {
		if (signal.kind === 'symbol') {
			const symbols = question.options.map(option => confirmedSymbolMarker(option, signal.prefix));

			return {
				sets: [symbols.map(symbol => symbol.matches)],
				ambiguous: [false]
			};
		}

		return markBySignal(styles, signal);
	});
	const activeIndices = markings.flatMap((marking, index) =>
		marking.sets[0].some(Boolean) ? [index] : []
	);
	// Профили без групп относятся к прежнему формату, где все сигналы должны
	// были присутствовать и совпасть. Сохраняем этот контракт одной общей группой.
	const selectorGroups =
		profile.selectorGroups ??
		(profile.signals.length > 0
			? [[0, ...profile.signals.slice(1).map((_, signalIndex) => signalIndex + 1)]]
			: []);
	const completeSelectors = selectorGroups.flatMap(group =>
		group.every(signalIndex => activeIndices.includes(signalIndex))
			? [group.map(signalIndex => markings[signalIndex].sets[0])]
			: []
	);
	const conflictingSelector = completeSelectors.some(
		selector => new Set(selector.map(questionSignature)).size !== 1
	);
	const selectedSets = completeSelectors.map(selector => selector[0]);
	const distinctActiveSets = new Set(
		activeIndices.map(signalIndex => questionSignature(markings[signalIndex].sets[0]))
	);
	if (
		hasForeignHighlightSource ||
		markings.some(marking => marking.ambiguous[0]) ||
		conflictingSelector ||
		(activeIndices.length > 0 && (selectedSets.length === 0 || distinctActiveSets.size !== 1))
	) {
		return {
			marked: question.options.map(() => false),
			ambiguous: true,
			consumedTextPrefixes: question.options.map(() => null)
		};
	}

	const marked = selectedSets.length > 0 ? [...selectedSets[0]] : question.options.map(() => false);

	return {
		marked,
		ambiguous: false,
		consumedTextPrefixes: confirmedSymbols.map((symbol, optionIndex) =>
			marked[optionIndex] ? symbol.consumedTextPrefix : null
		)
	};
}
