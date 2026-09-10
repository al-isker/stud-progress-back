import { PositionedPdfItem, groupPdfItemsByBaseline, splitPdfHorizontalGroup } from './pdf-layout';

export interface PdfPageNumberItem extends PositionedPdfItem {
	readonly id: string;
	readonly str: string;
	readonly fontFamily: string;
}

export interface PdfPageNumberPage {
	readonly page: number;
	readonly pageLeft: number;
	readonly pageBottom: number;
	readonly pageWidth: number;
	readonly pageHeight: number;
	readonly items: readonly PdfPageNumberItem[];
}

interface PageNumberCandidate {
	itemIds: string[];
	page: number;
	edge: 'top' | 'bottom';
	value: number;
	horizontalAlignment: 'left' | 'center' | 'right';
	horizontalAnchor: number;
	verticalAnchor: number;
	size: number;
	fontSignature: string;
}

interface CandidateTrack {
	placementId: number;
	offset: number;
	alignment: PageNumberCandidate['horizontalAlignment'];
	horizontalAnchor: number;
	ambiguousPages: Set<number>;
	candidatesByPage: Map<number, PageNumberCandidate[]>;
}

const PAGE_NUMBER_RE = /^\s*(\d{1,5})\s*$/;
const INNER_PAGE_MARGIN_FRACTION = 1 / 12;
const INNER_PAGE_MARGIN_FONT_SIZES = 8;
const EXTENDED_PAGE_MARGIN_FRACTION = 1 / 6;
const EXTENDED_PAGE_MARGIN_FONT_SIZES = 16;

function hasSamePageNumberCore(left: PageNumberCandidate, right: PageNumberCandidate): boolean {
	const sizeRatio = Math.max(left.size, right.size) / Math.min(left.size, right.size);

	return (
		left.edge === right.edge &&
		Math.abs(left.verticalAnchor - right.verticalAnchor) <= 0.75 &&
		sizeRatio <= 1.08 &&
		left.fontSignature === right.fontSignature
	);
}

function hasSameHorizontalPlacement(
	left: PageNumberCandidate,
	right: PageNumberCandidate
): boolean {
	return (
		left.horizontalAlignment === right.horizontalAlignment &&
		Math.abs(left.horizontalAnchor - right.horizontalAnchor) <= 0.75
	);
}

function distinctPages(candidates: PageNumberCandidate[]): number[] {
	return [...new Set(candidates.map(candidate => candidate.page))].sort(
		(left, right) => left - right
	);
}

function hasConsecutivePages(candidates: PageNumberCandidate[]): boolean {
	const pages = distinctPages(candidates);

	return pages.some((page, index) => index > 0 && page === pages[index - 1] + 1);
}

function hasOnlyUniqueCandidates(byPage: Map<number, PageNumberCandidate[]>): boolean {
	return [...byPage.values()].every(candidates => candidates.length === 1);
}

function toPageNumberCandidate(
	page: PdfPageNumberPage,
	edge: PageNumberCandidate['edge'],
	fragment: PdfPageNumberItem[]
): PageNumberCandidate | null {
	const match = PAGE_NUMBER_RE.exec(fragment.map(item => item.str).join(''));
	if (!match) return null;
	const value = Number(match[1]);
	if (!Number.isSafeInteger(value) || value < 1) return null;

	const x0 = Math.min(...fragment.map(item => item.x));
	const x1 = Math.max(...fragment.map(item => item.x + item.w));
	const center = (x0 + x1) / 2;
	const size = Math.max(...fragment.map(item => item.size));
	if (size <= 0 || page.pageWidth <= 0 || page.pageHeight <= 0) return null;
	const relativeCenter = (center - page.pageLeft) / page.pageWidth;
	const horizontalAlignment =
		relativeCenter < 1 / 3 ? 'left' : relativeCenter > 2 / 3 ? 'right' : 'center';
	const horizontalAnchor =
		horizontalAlignment === 'left'
			? (x0 - page.pageLeft) / size
			: horizontalAlignment === 'right'
				? (page.pageLeft + page.pageWidth - x1) / size
				: (center - (page.pageLeft + page.pageWidth / 2)) / size;
	const y = fragment[0].y;
	const verticalAnchor =
		edge === 'bottom'
			? (y - page.pageBottom) / size
			: (page.pageBottom + page.pageHeight - y) / size;

	return {
		itemIds: fragment.map(item => item.id),
		page: page.page,
		edge,
		value,
		horizontalAlignment,
		horizontalAnchor,
		verticalAnchor,
		size,
		fontSignature: [...new Set(fragment.map(item => item.fontFamily))].sort().join('|')
	};
}

/**
 * Во внутреннем поле достаточно физической позиции. Во внешней части
 * расширенного поля дополнительно требуется разрыв исходного PDF-потока:
 * нижний колонтитул должен быть записан до основного текста, верхний — после.
 * Обычная первая/последняя строка контента такого доказательства не имеет.
 */
function hasReliableMarginPlacement(
	page: PdfPageNumberPage,
	edge: PageNumberCandidate['edge'],
	fragment: PdfPageNumberItem[]
): boolean {
	const size = Math.max(...fragment.map(item => item.size));
	if (size <= 0 || page.pageHeight <= 0) return false;
	const y = fragment[0].y;
	const edgeDistance =
		edge === 'bottom' ? y - page.pageBottom : page.pageBottom + page.pageHeight - y;
	if (edgeDistance < 0) return false;
	const edgeFraction = edgeDistance / page.pageHeight;
	const edgeFontSizes = edgeDistance / size;
	if (edgeFraction <= INNER_PAGE_MARGIN_FRACTION && edgeFontSizes <= INNER_PAGE_MARGIN_FONT_SIZES) {
		return true;
	}
	if (
		edgeFraction > EXTENDED_PAGE_MARGIN_FRACTION ||
		edgeFontSizes > EXTENDED_PAGE_MARGIN_FONT_SIZES
	) {
		return false;
	}

	const fragmentItems = new Set(fragment);
	const itemOrder = new Map(page.items.map((item, index) => [item, index]));
	const contentItems = page.items.filter(
		item => item.str.trim() !== '' && !fragmentItems.has(item)
	);
	if (contentItems.length === 0) return false;
	const fragmentOrders = fragment.map(item => itemOrder.get(item)!);
	const contentOrders = contentItems.map(item => itemOrder.get(item)!);

	return edge === 'bottom'
		? Math.max(...fragmentOrders) < Math.min(...contentOrders)
		: Math.min(...fragmentOrders) > Math.max(...contentOrders);
}

function collectCandidates(pages: readonly PdfPageNumberPage[]): {
	candidates: PageNumberCandidate[];
	evidencePages: Set<number>;
} {
	const candidates: PageNumberCandidate[] = [];
	const evidencePages = new Set<number>();
	for (const page of pages) {
		const groups = groupPdfItemsByBaseline(page.items);
		if (groups.length < 2) continue;
		evidencePages.add(page.page);
		const edgeGroups = [
			['top', groups[0]],
			['bottom', groups[groups.length - 1]]
		] as const;
		for (const [edge, group] of edgeGroups) {
			for (const fragment of splitPdfHorizontalGroup(group, page.pageWidth)) {
				if (!hasReliableMarginPlacement(page, edge, fragment)) continue;
				const candidate = toPageNumberCandidate(page, edge, fragment);
				if (candidate) candidates.push(candidate);
			}
		}
	}

	return { candidates, evidencePages };
}

function toTrack(
	candidates: PageNumberCandidate[],
	offset: number,
	placementId: number,
	ambiguousPages: Set<number>
): CandidateTrack {
	const candidatesByPage = new Map<number, PageNumberCandidate[]>();
	for (const candidate of candidates) {
		candidatesByPage.set(candidate.page, [
			...(candidatesByPage.get(candidate.page) ?? []),
			candidate
		]);
	}

	return {
		placementId,
		offset,
		alignment: candidates[0].horizontalAlignment,
		horizontalAnchor: candidates[0].horizontalAnchor,
		ambiguousPages,
		candidatesByPage
	};
}

function createTracks(core: PageNumberCandidate[]): CandidateTrack[] {
	const placements: PageNumberCandidate[][] = [];
	for (const candidate of core) {
		const placement = placements.find(current => hasSameHorizontalPlacement(current[0], candidate));
		if (placement) placement.push(candidate);
		else placements.push([candidate]);
	}

	return placements.flatMap((placement, placementId) => {
		const byOffset = new Map<number, PageNumberCandidate[]>();
		const candidateCountsByPage = new Map<number, number>();
		for (const candidate of placement) {
			const offset = candidate.value - candidate.page;
			byOffset.set(offset, [...(byOffset.get(offset) ?? []), candidate]);
			candidateCountsByPage.set(
				candidate.page,
				(candidateCountsByPage.get(candidate.page) ?? 0) + 1
			);
		}
		const ambiguousPages = new Set(
			[...candidateCountsByPage]
				.filter(([, candidateCount]) => candidateCount > 1)
				.map(([page]) => page)
		);

		return [...byOffset].map(([offset, candidates]) =>
			toTrack(candidates, offset, placementId, ambiguousPages)
		);
	});
}

function trackEvidence(track: CandidateTrack): PageNumberCandidate[] | null {
	const unambiguousByPage = new Map(
		[...track.candidatesByPage].filter(([page]) => !track.ambiguousPages.has(page))
	);
	if (!hasOnlyUniqueCandidates(unambiguousByPage)) return null;

	return [...unambiguousByPage.values()]
		.map(candidates => candidates[0])
		.sort((left, right) => left.page - right.page);
}

function isContiguous(candidates: PageNumberCandidate[]): boolean {
	const pages = distinctPages(candidates);

	return pages.length > 0 && pages[pages.length - 1] - pages[0] + 1 === pages.length;
}

function parity(candidates: PageNumberCandidate[]): 0 | 1 | null {
	const values = new Set(candidates.map(candidate => (candidate.page % 2) as 0 | 1));

	return values.size === 1 ? [...values][0] : null;
}

function confirmDirectTracks(
	tracks: CandidateTrack[],
	minimumPageCount: number,
	confirmed: Set<CandidateTrack>
): void {
	for (const track of tracks) {
		const evidence = trackEvidence(track);
		if (!evidence || evidence.length < minimumPageCount || !hasConsecutivePages(evidence)) continue;
		confirmed.add(track);
	}
}

function confirmRestartedTracks(
	tracks: CandidateTrack[],
	minimumPageCount: number,
	evidencePages: ReadonlySet<number>,
	confirmed: Set<CandidateTrack>
): void {
	const byPlacement = new Map<number, CandidateTrack[]>();
	for (const track of tracks) {
		byPlacement.set(track.placementId, [...(byPlacement.get(track.placementId) ?? []), track]);
	}
	for (const placementTracks of byPlacement.values()) {
		const restartRuns = placementTracks.filter(track => {
			const evidence = trackEvidence(track);

			return evidence !== null && evidence.length >= 3 && isContiguous(evidence);
		});
		if (restartRuns.length < 2) continue;
		const orderedRuns = restartRuns
			.map(track => ({ track, evidence: trackEvidence(track)! }))
			.sort((left, right) => left.evidence[0].page - right.evidence[0].page);
		const pages = orderedRuns.flatMap(run => run.evidence.map(candidate => candidate.page));
		if (new Set(pages).size !== pages.length) continue;
		if (pages.length < minimumPageCount) continue;
		let validRestartSequence = true;
		for (let index = 1; index < orderedRuns.length; index++) {
			const previous = orderedRuns[index - 1].evidence;
			const current = orderedRuns[index].evidence;
			const previousLast = previous[previous.length - 1];
			const currentFirst = current[0];
			if (currentFirst.value >= previousLast.value) {
				validRestartSequence = false;
				break;
			}
			if ([...evidencePages].some(page => page > previousLast.page && page < currentFirst.page)) {
				validRestartSequence = false;
				break;
			}
		}
		if (!validRestartSequence) continue;
		for (const { track } of orderedRuns) confirmed.add(track);
	}
}

function confirmMirroredTracks(
	tracks: CandidateTrack[],
	minimumPageCount: number,
	confirmed: Set<CandidateTrack>
): void {
	for (let leftIndex = 0; leftIndex < tracks.length; leftIndex++) {
		const left = tracks[leftIndex];
		const leftEvidence = trackEvidence(left);
		if (!leftEvidence || leftEvidence.length < 2) continue;
		for (const right of tracks.slice(leftIndex + 1)) {
			if (left.offset !== right.offset) continue;
			if (new Set([left.alignment, right.alignment]).size !== 2) continue;
			if (![left.alignment, right.alignment].every(value => value !== 'center')) continue;
			if (Math.abs(left.horizontalAnchor - right.horizontalAnchor) > 0.75) continue;
			const rightEvidence = trackEvidence(right);
			if (!rightEvidence || rightEvidence.length < 2) continue;
			const leftParity = parity(leftEvidence);
			const rightParity = parity(rightEvidence);
			if (leftParity === null || rightParity === null || leftParity === rightParity) continue;
			const combined = [...leftEvidence, ...rightEvidence];
			if (new Set(combined.map(candidate => candidate.page)).size !== combined.length) continue;
			if (combined.length < minimumPageCount || !hasConsecutivePages(combined)) continue;
			confirmed.add(left);
			confirmed.add(right);
		}
	}
}

function addConfirmedTrackItems(track: CandidateTrack, result: Set<string>): void {
	for (const candidates of track.candidatesByPage.values()) {
		if (candidates.length !== 1 || track.ambiguousPages.has(candidates[0].page)) continue;
		for (const id of candidates[0].itemIds) result.add(id);
	}
}

/**
 * Подтверждает документный профиль колонтитульных номеров страниц.
 *
 * Доказательством служат только отдельные цифровые фрагменты в физическом поле
 * страницы с основным текстом. Однородный профиль обязан покрывать минимум две
 * трети таких страниц (и минимум три), сохранять геометрию, размер, семейство
 * шрифта и точную зависимость `value - physicalPage`. Поддерживаются зеркальное
 * положение на чётных/нечётных страницах и перезапуск нумерации непрерывными
 * разделами. Единственная строка страницы всегда остаётся неоднозначной и не
 * удаляется. Смысл текста вопросов и ответов не анализируется.
 */
export function findConfirmedPageNumberItemIds(pages: readonly PdfPageNumberPage[]): Set<string> {
	const { candidates, evidencePages } = collectCandidates(pages);
	const minimumPageCount = Math.max(3, Math.ceil((evidencePages.size * 2) / 3));
	const coreGroups: PageNumberCandidate[][] = [];
	for (const candidate of candidates) {
		const core = coreGroups.find(current => hasSamePageNumberCore(current[0], candidate));
		if (core) core.push(candidate);
		else coreGroups.push([candidate]);
	}

	const confirmedIds = new Set<string>();
	for (const core of coreGroups) {
		const tracks = createTracks(core);
		const confirmedTracks = new Set<CandidateTrack>();
		confirmDirectTracks(tracks, minimumPageCount, confirmedTracks);
		confirmRestartedTracks(tracks, minimumPageCount, evidencePages, confirmedTracks);
		confirmMirroredTracks(tracks, minimumPageCount, confirmedTracks);
		for (const track of confirmedTracks) addConfirmedTrackItems(track, confirmedIds);
	}

	return confirmedIds;
}
