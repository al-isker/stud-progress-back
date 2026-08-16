import { QuestionRejectionReason } from '../types/parse-result';
import {
	AnswerMarkerProfile,
	applyAnswerMarkerProfile,
	inferAnswerMarkerProfile
} from './detect-marker';
import { analyzePercentageSyntax, isOrdinaryEqualsQuestion } from './detect-percentage-marker';
import type { PercentageSyntaxAnalysis } from './detect-percentage-marker';
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
	| (RecognizedBase & {
			kind: 'choice';
			grammar: 'document' | 'percentage';
			marked: boolean[];
	  })
	| (RecognizedBase & { kind: 'matching' })
	| (RecognizedBase & { kind: 'rejected'; reason: QuestionRejectionReason });

export interface RecognizedDocumentSyntax {
	profile: DocumentSyntaxProfile;
	questions: QuestionSyntaxResult[];
}

const hasStrictMajority = (count: number, total: number) => count > total / 2;

function canBeOrdinaryEqualsQuestion(
	question: RawQuestion,
	percentage: PercentageSyntaxAnalysis
): boolean {
	return (
		percentage.kind === 'incomplete' &&
		percentage.evidenceIndices.every(index =>
			question.options[index].structuralPrefix?.startsWith('=')
		)
	);
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
	const percentageSyntax = questions.map(analyzePercentageSyntax);
	const matchingCandidates = questions.map(isMatchingCandidate);
	const globalIndices = questions.flatMap((question, questionIndex) => {
		if (question.rejectionReason || question.options.length < 2) return [];
		const percentage = percentageSyntax[questionIndex];

		return percentage.kind === 'none' || canBeOrdinaryEqualsQuestion(question, percentage)
			? [questionIndex]
			: [];
	});
	const globalQuestions = globalIndices.map(questionIndex => questions[questionIndex]);
	const globalIndexSet = new Set(globalIndices);
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
	const ordinaryEqualsQuestions = questions.map((question, questionIndex) =>
		isOrdinaryEqualsQuestion(question, percentageSyntax[questionIndex], answerMarker)
	);

	const answerableIndices = questions
		.map((question, index) => ({ question, index }))
		.filter(({ question, index }) => {
			if (question.rejectionReason || question.options.length === 0) return false;
			const percentage = percentageSyntax[index];
			if (percentage.kind === 'resolved' || percentage.kind === 'unresolved') return true;

			return globalIndexSet.has(index);
		})
		.map(({ index }) => index);
	if (answerableIndices.length === 0) return null;

	const syntaxResults: QuestionSyntaxResult[] = questions.map((question, questionIndex) => {
		const emptyPrefixes = question.options.map(() => null);
		if (question.rejectionReason) {
			return {
				kind: 'rejected',
				reason: question.rejectionReason,
				consumedTextPrefixes: emptyPrefixes
			};
		}

		const percentage = percentageSyntax[questionIndex];
		if (percentage.kind === 'resolved') {
			return {
				kind: 'choice',
				grammar: 'percentage',
				marked: percentage.marked,
				consumedTextPrefixes: percentage.consumedTextPrefixes
			};
		}
		if (percentage.kind === 'unresolved') {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.NO_ANSWER_MARKER,
				consumedTextPrefixes: percentage.consumedTextPrefixes
			};
		}
		const ordinaryEquals = ordinaryEqualsQuestions[questionIndex];
		if (percentage.kind === 'incomplete' && !ordinaryEquals) {
			return {
				kind: 'rejected',
				reason: QuestionRejectionReason.MALFORMED_STRUCTURE,
				consumedTextPrefixes: percentage.consumedTextPrefixes
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

		const applied = appliedGlobal.get(questionIndex);
		const consumedTextPrefixes = applied?.consumedTextPrefixes ?? emptyPrefixes;
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

		return { kind: 'choice', grammar: 'document', marked, consumedTextPrefixes };
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
				percentage: percentageSyntax.some(
					(percentage, questionIndex) =>
						percentage.kind !== 'none' && !ordinaryEqualsQuestions[questionIndex]
				),
				matching: matchingCandidates.some(Boolean)
			}
		},
		questions: syntaxResults
	};
}
