import { extractPdfLines } from './extract/extract-pdf';
import { parseTestDocument } from './parse-test-document';
import { DocLine } from './types/document-model';
import { ParseRejectionReason, ParseStatus } from './types/parse-result';

jest.mock('./extract/extract-pdf', () => ({ extractPdfLines: jest.fn() }));

const mockedExtractPdfLines = jest.mocked(extractPdfLines);

function line(text: string): DocLine {
	return {
		page: 1,
		y: 700,
		x0: 50,
		x1: 250,
		size: 12,
		text,
		boldFrac: 0,
		italicFrac: 0,
		color: null,
		highlightFrac: 0,
		gapBefore: 10
	};
}

function questions(count: number): DocLine[] {
	return Array.from({ length: count }, (_, index) => [
		line(`Question ${index + 1} {`),
		line('=correct'),
		line('~wrong'),
		line('}')
	]).flat();
}

describe('question count limit', () => {
	test('rejects the whole document when it contains more than 2000 questions', async () => {
		mockedExtractPdfLines.mockResolvedValue(questions(2001));

		const result = await parseTestDocument({ data: Buffer.from('%PDF-') });

		expect(result).toEqual({
			status: ParseStatus.REJECTED,
			reason: ParseRejectionReason.QUESTION_LIMIT_EXCEEDED
		});
	});
});
