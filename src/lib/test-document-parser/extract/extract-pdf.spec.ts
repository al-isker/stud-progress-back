import { extractPdfLines } from './extract-pdf';

function singlePagePdf(
	content: string,
	extraResources = '',
	extraObjects: string[] = [],
	pageEntries = '',
	catalogEntries = ''
): Buffer {
	const objects = [
		`<< /Type /Catalog /Pages 2 0 R ${catalogEntries} >>`,
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 800] /Resources << /Font << /F1 5 0 R >> ${extraResources} >> /Contents 4 0 R ${pageEntries} >>`,
		`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		...extraObjects
	];
	let pdf = '%PDF-1.4\n';
	const offsets = [0];
	for (let index = 0; index < objects.length; index++) {
		offsets.push(Buffer.byteLength(pdf));
		pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
	}
	const xrefOffset = Buffer.byteLength(pdf);
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) {
		pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

	return Buffer.from(pdf);
}

const text = 'BT /F1 12 Tf 50 700 Td (answer) Tj ET';
const yellow = '1 1 0 rg 45 696 70 14 re f';
const black = '0 0 0 rg 45 696 70 14 re f';
const white = '1 1 1 rg 45 696 70 14 re f';

function rgbImageObject(width: number, height: number, pixels: Buffer): string {
	const encoded = `${pixels.toString('hex').toUpperCase()}>`;

	return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${Buffer.byteLength(encoded)} >>\nstream\n${encoded}\nendstream`;
}

describe('extractPdfLines paint order', () => {
	test('does not expose a highlight hidden by a later opaque fill', async () => {
		const [line] = await extractPdfLines(singlePagePdf(`${yellow}\n${white}\n${text}`));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps a highlight painted over an earlier opaque fill', async () => {
		const [line] = await extractPdfLines(singlePagePdf(`${white}\n${yellow}\n${text}`));

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('does not treat a whole-page background as an answer marker', async () => {
		const background = '1 1 0 rg 0 0 300 800 re f';
		const [line] = await extractPdfLines(singlePagePdf(`${background}\n${text}`));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('does not expose paint from a hidden optional-content group', async () => {
		const hiddenLayer = '<< /Type /OCG /Name (hidden answers) >>';
		const hiddenHighlight = '/OC /Hidden BDC 1 1 0 rg 45 696 70 14 re f EMC';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${hiddenHighlight}\n${text}`,
				'/Properties << /Hidden 6 0 R >>',
				[hiddenLayer],
				'',
				'/OCProperties << /OCGs [6 0 R] /D << /BaseState /ON /OFF [6 0 R] >> >>'
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps disconnected highlights even when their combined bounding box spans the page', async () => {
		const disconnected = '1 1 0 rg 0 0 10 10 re 45 696 70 14 re 290 790 10 10 re f';
		const [line] = await extractPdfLines(singlePagePdf(`${disconnected}\n${text}`));

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps a translucent raster paint over an unknown backdrop ambiguous', async () => {
		const image =
			'<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nFFFF00>\nendstream';
		const opacity = '<< /Type /ExtGState /ca 0.2 >>';
		const imagePaint = 'q /GS1 gs 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${black}\n${imagePaint}\n${text}`,
				'/XObject << /Im1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[image, opacity]
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('accepts a translucent raster highlight on the default white page', async () => {
		const image =
			'<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nFFFF00>\nendstream';
		const opacity = '<< /Type /ExtGState /ca 0.2 >>';
		const imagePaint = 'q /GS1 gs 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${imagePaint}\n${text}`,
				'/XObject << /Im1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[image, opacity]
			)
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps a page-sized raster highlight when clipping limits it to the answer', async () => {
		const image = rgbImageObject(1, 1, Buffer.from([255, 255, 0]));
		const imagePaint = 'q 45 696 70 14 re W n 300 0 0 800 0 0 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${imagePaint}\n${text}`, '/XObject << /Im1 6 0 R >>', [image])
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('detects a visible raster highlight below the former alpha cutoff', async () => {
		const image = rgbImageObject(1, 1, Buffer.from([255, 255, 0]));
		const opacity = '<< /Type /ExtGState /ca 0.1 >>';
		const imagePaint = 'q /GS1 gs 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${imagePaint}\n${text}`,
				'/XObject << /Im1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[image, opacity]
			)
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps sparse raster color evidence ambiguous instead of treating it as occlusion', async () => {
		const width = 5280;
		const pixels = Buffer.alloc(width * 3, 255);
		for (let x = 0; x < width; x += 11) pixels[x * 3 + 2] = 0;
		const image = rgbImageObject(width, 1, pixels);
		const imagePaint = 'q 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${imagePaint}\n${text}`, '/XObject << /Im1 6 0 R >>', [image])
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('does not treat a translucent achromatic raster as a selector by itself', async () => {
		const image = rgbImageObject(1, 1, Buffer.from([255, 255, 255]));
		const opacity = '<< /Type /ExtGState /ca 0.5 >>';
		const imagePaint = 'q /GS1 gs 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${imagePaint}\n${text}`,
				'/XObject << /Im1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[image, opacity]
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps a lower highlight under translucent achromatic raster ambiguous', async () => {
		const image = rgbImageObject(1, 1, Buffer.from([255, 255, 255]));
		const opacity = '<< /Type /ExtGState /ca 0.5 >>';
		const imagePaint = 'q /GS1 gs 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${yellow}\n${imagePaint}\n${text}`,
				'/XObject << /Im1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[image, opacity]
			)
		);

		expect(line.highlightAmbiguous).toBe(true);
	});

	test('keeps disconnected raster highlights as separate sources', async () => {
		const pixels = Buffer.from([
			255, 255, 0, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 255, 255,
			0
		]);
		const image = rgbImageObject(7, 1, pixels);
		const imagePaint = 'q 42 0 0 14 48 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${imagePaint}\n${text}`, '/XObject << /Im1 6 0 R >>', [image])
		);

		expect(line.highlightSources).toHaveLength(2);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('applies a raster clip without recomputing it for every sample', async () => {
		const image = rgbImageObject(1, 1, Buffer.from([255, 255, 0]));
		const clippedImage = 'q 200 696 20 14 re W n 70 0 0 14 45 696 cm /Im1 Do Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${clippedImage}\n${text}`, '/XObject << /Im1 6 0 R >>', [image])
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps a translucent vector paint over an unknown backdrop ambiguous', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.1 >>';
		const translucentYellow = 'q /GS1 gs 1 1 0 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${black}\n${translucentYellow}\n${text}`, '/ExtGState << /GS1 6 0 R >>', [
				opacity
			])
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('accepts a translucent vector highlight on the default white page', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.1 >>';
		const translucentYellow = 'q /GS1 gs 1 1 0 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${translucentYellow}\n${text}`, '/ExtGState << /GS1 6 0 R >>', [opacity])
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('accepts a translucent vector highlight over a confirmed white paint', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.1 >>';
		const translucentYellow = 'q /GS1 gs 1 1 0 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${white}\n${translucentYellow}\n${text}`, '/ExtGState << /GS1 6 0 R >>', [
				opacity
			])
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps overlapping backdrop-dependent highlight layers fail-closed', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.2 >>';
		const translucentYellow = 'q /GS1 gs 1 1 0 rg 45 696 70 14 re f Q';
		const translucentBlue = 'q /GS1 gs 0 0.7 1 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${translucentYellow}\n${translucentBlue}\n${text}`,
				'/ExtGState << /GS1 6 0 R >>',
				[opacity]
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('keeps a backdrop-dependent highlight over another color fail-closed', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.2 >>';
		const translucentBlue = 'q /GS1 gs 0 0.7 1 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${yellow}\n${translucentBlue}\n${text}`, '/ExtGState << /GS1 6 0 R >>', [
				opacity
			])
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('rejects a composition whose individually valid highlight colors become dark', async () => {
		const opacity = '<< /Type /ExtGState /ca 0.9 >>';
		const translucentRed = 'q /GS1 gs 0.278 0 0 rg 45 696 70 14 re f Q';
		const translucentBlue = 'q /GS1 gs 0 0 0.278 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${translucentRed}\n${translucentBlue}\n${text}`,
				'/ExtGState << /GS1 6 0 R >>',
				[opacity]
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('keeps a later translucent occlusion fail-closed', async () => {
		const translucent = '<< /Type /ExtGState /ca 0.5 >>';
		const translucentWhite = 'q /GS1 gs 1 1 1 rg 45 696 70 14 re f Q';
		const [line] = await extractPdfLines(
			singlePagePdf(`${yellow}\n${translucentWhite}\n${text}`, '/ExtGState << /GS1 6 0 R >>', [
				translucent
			])
		);

		expect(line.highlightAmbiguous).toBe(true);
	});

	test('does not fall back to QuadPoints for an explicitly empty appearance stream', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Highlight /Rect [45 696 115 710] /C [1 1 0] /QuadPoints [45 710 115 710 45 696 115 696] /AP << /N 7 0 R >> >>';
		const emptyAppearance =
			'<< /Type /XObject /Subtype /Form /BBox [45 696 115 710] /Resources << >> /Length 0 >>\nstream\n\nendstream';
		const [line] = await extractPdfLines(
			singlePagePdf(text, '', [annotation, emptyAppearance], '/Annots [6 0 R]')
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('does not synthesize an invisible native highlight annotation', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Highlight /Rect [45 696 115 710] /C [1 1 0] /CA 0 /QuadPoints [45 710 115 710 45 696 115 696] >>';
		const [line] = await extractPdfLines(singlePagePdf(text, '', [annotation], '/Annots [6 0 R]'));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('does not synthesize a hidden native highlight annotation', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Highlight /F 2 /Rect [45 696 115 710] /C [1 1 0] /QuadPoints [45 710 115 710 45 696 115 696] >>';
		const [line] = await extractPdfLines(singlePagePdf(text, '', [annotation], '/Annots [6 0 R]'));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('uses exact stroke geometry from a non-empty Ink appearance', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Ink /Rect [39 697 121 709] /C [1 1 0] /CA 0.2 /BS << /W 12 >> /InkList [[45 703 115 703]] /AP << /N 7 0 R >> >>';
		const appearanceContent = 'q /GS1 gs 1 1 0 RG 12 w 1 J 45 703 m 115 703 l S Q';
		const appearance = `<< /Type /XObject /Subtype /Form /BBox [39 697 121 709] /Resources << /ExtGState << /GS1 8 0 R >> >> /Length ${Buffer.byteLength(appearanceContent)} >>\nstream\n${appearanceContent}\nendstream`;
		const opacity = '<< /Type /ExtGState /CA 0.2 /ca 0.2 >>';
		const [line] = await extractPdfLines(
			singlePagePdf(text, '', [annotation, appearance, opacity], '/Annots [6 0 R]')
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('treats an annotation appearance as authoritative over its InkList and color metadata', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Ink /Rect [39 697 121 709] /C [1 1 0] /CA 0.2 /BS << /W 12 >> /InkList [[45 703 115 703]] /AP << /N 7 0 R >> >>';
		const appearanceContent = '0 0 0 RG 12 w 1 J 45 703 m 115 703 l S';
		const appearance = `<< /Type /XObject /Subtype /Form /BBox [39 697 121 709] /Resources << >> /Length ${Buffer.byteLength(appearanceContent)} >>\nstream\n${appearanceContent}\nendstream`;
		const [line] = await extractPdfLines(
			singlePagePdf(text, '', [annotation, appearance], '/Annots [6 0 R]')
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('clips an appearance stroke by its explicit clipping path', async () => {
		const annotation =
			'<< /Type /Annot /Subtype /Ink /Rect [39 690 121 760] /C [1 1 0] /AP << /N 7 0 R >> >>';
		const appearanceContent = 'q 105 740 10 10 re W n 1 1 0 RG 12 w 1 J 45 703 m 115 703 l S Q';
		const appearance = `<< /Type /XObject /Subtype /Form /BBox [39 690 121 760] /Resources << >> /Length ${Buffer.byteLength(appearanceContent)} >>\nstream\n${appearanceContent}\nendstream`;
		const [line] = await extractPdfLines(
			singlePagePdf(text, '', [annotation, appearance], '/Annots [6 0 R]')
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps an unsupported dashed highlight stroke ambiguous', async () => {
		const dashedYellow = '1 1 0 RG 12 w 1 J [4 4] 0 d 45 703 m 115 703 l S';
		const [line] = await extractPdfLines(singlePagePdf(`${dashedYellow}\n${text}`));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('treats painting an explicitly empty path as a no-op', async () => {
		const [line] = await extractPdfLines(singlePagePdf(`1 1 0 RG 12 w S\n${text}`));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('honors a later opaque stroke that hides an earlier highlight stroke', async () => {
		const yellowStroke = '1 1 0 RG 12 w 1 J 45 703 m 115 703 l S';
		const whiteStroke = '1 1 1 RG 12 w 1 J 45 703 m 115 703 l S';
		const [line] = await extractPdfLines(singlePagePdf(`${yellowStroke}\n${whiteStroke}\n${text}`));

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('clips transparency-group paint to its transformed bbox', async () => {
		const groupContent = '1 1 0 rg 45 696 70 14 re f';
		const group = `<< /Type /XObject /Subtype /Form /BBox [0 0 10 10] /Group << /S /Transparency /I true /K true >> /Resources << >> /Length ${Buffer.byteLength(groupContent)} >>\nstream\n${groupContent}\nendstream`;
		const [line] = await extractPdfLines(
			singlePagePdf(`q /Fm1 Do Q\n${text}`, '/XObject << /Fm1 6 0 R >>', [group])
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('keeps transparency-group paint under non-default outer compositing ambiguous', async () => {
		const groupContent = '1 1 0 rg 45 696 70 14 re f';
		const group = `<< /Type /XObject /Subtype /Form /BBox [0 0 300 800] /Group << /S /Transparency /I true >> /Resources << >> /Length ${Buffer.byteLength(groupContent)} >>\nstream\n${groupContent}\nendstream`;
		const opacity = '<< /Type /ExtGState /ca 0.1 >>';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`q /GS1 gs /Fm1 Do Q\n${text}`,
				'/XObject << /Fm1 6 0 R >> /ExtGState << /GS1 7 0 R >>',
				[group, opacity]
			)
		);

		expect(line.highlightFrac).toBe(0);
		expect(line.highlightAmbiguous).toBe(true);
	});

	test('applies outer Multiply once to an isolated highlight group', async () => {
		const groupContent = 'q /Inner gs 1 0.812 0.184 rg 45 696 70 14 re f Q';
		const group = `<< /Type /XObject /Subtype /Form /BBox [0 0 300 800] /Group << /S /Transparency /I true >> /Resources << /ExtGState << /Inner 8 0 R >> >> /Length ${Buffer.byteLength(groupContent)} >>\nstream\n${groupContent}\nendstream`;
		const multiply = '<< /Type /ExtGState /BM /Multiply >>';
		const innerOpacity = '<< /Type /ExtGState /ca 0.349 >>';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`q /Outer gs /Fm1 Do Q\n${text}`,
				'/XObject << /Fm1 6 0 R >> /ExtGState << /Outer 7 0 R >>',
				[group, multiply, innerOpacity]
			)
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});

	test('treats white in an isolated Multiply group as transparent', async () => {
		const groupContent = '1 1 1 rg 45 696 70 14 re f';
		const group = `<< /Type /XObject /Subtype /Form /BBox [0 0 300 800] /Group << /S /Transparency /I true >> /Resources << >> /Length ${Buffer.byteLength(groupContent)} >>\nstream\n${groupContent}\nendstream`;
		const multiply = '<< /Type /ExtGState /BM /Multiply >>';
		const [line] = await extractPdfLines(
			singlePagePdf(
				`${yellow}\nq /Outer gs /Fm1 Do Q\n${text}`,
				'/XObject << /Fm1 6 0 R >> /ExtGState << /Outer 7 0 R >>',
				[group, multiply]
			)
		);

		expect(line.highlightFrac).toBeGreaterThan(0.9);
		expect(line.highlightAmbiguous).toBe(false);
	});
});
