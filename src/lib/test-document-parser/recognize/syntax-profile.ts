import { QuestionRejectionReason } from '../types/parse-result';
import {
	AnswerMarkerProfile,
	applyAnswerMarkerProfile,
	inferAnswerMarkerProfile
} from './detect-marker';
import {
	hasMalformedPercentageSyntax,
	percentageTextPrefixes,
	resolvePercentageMarker
} from './detect-percentage-marker';
import { hasMatchingMarkerPattern, isMatchingCandidate } from './matching';
import { DocumentStructureProfile, RawQuestion, SegmentedDocument } from './segment';

/** Полный подтверждённый синтаксис одного документа. */
export interface DocumentSyntaxProfile {
	structure: DocumentStructureProfile;
	answerMarker: AnswerMarkerProfile | null;
	localGrammars: {
		percentage: boolean;
		matching: boolean;
	};
}

interface RecognizedBase {
	consumedTextPrefixes: (string | null)[];
}

export type QuestionSyntaxResult =
	| (RecognizedBase & { kind: 'choice'; marked: boolean[] })
	| (RecognizedBase & { kind: 'matching' })
	| (RecognizedBase & { kind: 'rejected'; reason: QuestionRejectionReason });

export interface RecognizedDocumentSyntax {
	profile: DocumentSyntaxProfile;
	questions: QuestionSyntaxResult[];
}

const hasStrictMajority = (count: number, total: number) => count > total / 2;

function longerPrefix(left: string | null, right: string | null): string | null {
	if (!left) return right;
	if (!right) return left;

	return left.length >= right.length ? left : right;
}

/**
 * Сначала выводит единый профиль документа, затем применяет его к каждому
 * вопросу. Локальные percentage/matching-грамматики не голосуют за основной
 * маркер, но учитываются при подтверждении документа.
 */
export function recognizeDocumentSyntax(
	document: SegmentedDocument
): RecognizedDocumentSyntax | null {
	const { questions } = document;
	const malformedPercentage = questions.map(hasMalformedPercentageSyntax);
	const answerableIndices = questions
		.map((question, index) => ({ question, index }))
		.filter(
			({ question, index }) =>
				!question.rejectionReason && !malformedPercentage[index] && question.options.length >= 2
		)
		.map(({ index }) => index);
	if (answerableIndices.length === 0) return null;

	const percentageResults = questions.map(resolvePercentageMarker);
	const matchingCandidates = questions.map(isMatchingCandidate);
	const globalIndices = answerableIndices.filter(
		questionIndex => !percentageResults[questionIndex].recognized
	);
	const globalQuestions = globalIndices.map(questionIndex => questions[questionIndex]);
	const evaluationIndices = globalIndices
		.map((questionIndex, localIndex) => ({ questionIndex, localIndex }))
		.filter(({ questionIndex }) => !matchingCandidates[questionIndex])
		.map(({ localIndex }) => localIndex);
	const answerMarker = inferAnswerMarkerProfile(globalQuestions, evaluationIndices);
	const appliedGlobal = new Map(
		globalIndices.map((questionIndex, localIndex) => [
			questionIndex,
			answerMarker ? applyAnswerMarkerProfile(globalQuestions[localIndex], answerMarker) : null
		])
	);

	const syntaxResults: QuestionSyntaxResult[] = questions.map((question, questionIndex) => {
		const emptyPrefixes = question.options.map(() => null);
		if (question.rejectionReason) {
			return {
				kind: 'rejected',
				reason: question.rejectionReason,
				consumedTextPrefixes: emptyPrefixes
			};
		}
		if (malformedPercentage[questionIndex]) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.MALFORMED_STRUCTURE,
				consumedTextPrefixes: percentageTextPrefixes(question)
			};
		}
		if (question.options.length < 2) {
			return {
				kind: 'rejected',
				reason:
					question.options.length === 1
						? QuestionRejectionReason.SINGLE_OPTION
						: QuestionRejectionReason.NO_OPTIONS,
				consumedTextPrefixes: emptyPrefixes
			};
		}

		const percentage = percentageResults[questionIndex];
		if (percentage.recognized) {
			return percentage.resolved
				? {
						kind: 'choice',
						marked: percentage.marked,
						consumedTextPrefixes: percentage.consumedTextPrefixes
					}
				: {
						kind: 'rejected',
						reason: QuestionRejectionReason.NO_ANSWER_MARKER,
						consumedTextPrefixes: percentageTextPrefixes(question)
					};
		}

		const applied = appliedGlobal.get(questionIndex);
		const percentagePrefixes = percentageTextPrefixes(question);
		const consumedTextPrefixes = question.options.map((_, optionIndex) =>
			longerPrefix(
				percentagePrefixes[optionIndex],
				applied?.consumedTextPrefixes[optionIndex] ?? null
			)
		);
		if (applied?.ambiguous) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.AMBIGUOUS_ANSWER_MARKER,
				consumedTextPrefixes
			};
		}
		const marked = applied?.marked ?? question.options.map(() => false);
		if (matchingCandidates[questionIndex] && hasMatchingMarkerPattern(marked)) {
			return { kind: 'matching', consumedTextPrefixes };
		}
		if (!marked.some(Boolean)) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.NO_ANSWER_MARKER,
				consumedTextPrefixes
			};
		}

		return { kind: 'choice', marked, consumedTextPrefixes };
	});

	const resolvedCount = answerableIndices.filter(questionIndex => {
		const result = syntaxResults[questionIndex];

		return result.kind === 'choice' || result.kind === 'matching';
	}).length;
	if (!hasStrictMajority(resolvedCount, answerableIndices.length)) return null;

	return {
		profile: {
			structure: document.structure,
			answerMarker,
			localGrammars: {
				percentage: percentageResults.some(result => result.recognized),
				matching: matchingCandidates.some(Boolean)
			}
		},
		questions: syntaxResults
	};
}
