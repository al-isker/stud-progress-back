import { fixHomoglyphs } from './extract-pdf';

describe('fixHomoglyphs', () => {
	test('replaces Latin homoglyphs in predominantly Cyrillic words', () => {
		expect(fixHomoglyphs('пaциент Cиндром MОСКВА нa')).toBe('пациент Синдром МОСКВА на');
	});

	test('replaces Cyrillic homoglyphs in predominantly Latin words', () => {
		expect(fixHomoglyphs('OpenАI CОDEX IХ ХII ХV')).toBe('OpenAI CODEX IX XII XV');
	});

	test('keeps single-script and ambiguous words unchanged', () => {
		expect(fixHomoglyphs('пациент OpenAI AА testслово')).toBe('пациент OpenAI AА testслово');
	});
});
