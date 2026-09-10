import { createRequire } from 'node:module';

/**
 * Узкие собственные типы под используемую поверхность pdfjs-dist —
 * чтобы не зависеть от структуры её деклараций между версиями.
 */
export interface PdfTextItem {
	str?: string;
	transform?: number[];
	width?: number;
	fontName?: string;
}

export interface PdfTextContent {
	items: PdfTextItem[];
	styles?: Record<string, PdfTextStyle>;
}

export interface PdfTextStyle {
	fontFamily?: string;
}

export interface PdfAnnotation {
	id?: string;
	subtype?: string;
	rect?: number[];
}

export interface PdfObjects {
	has(id: string): boolean;
	get(id: string): unknown;
	get(id: string, callback: (obj: unknown) => void): void;
}

export interface PdfImageObject {
	width?: number;
	height?: number;
	kind?: number;
	data?: Uint8ClampedArray;
}

export interface PdfOperatorList {
	fnArray: number[];
	argsArray: unknown[];
}

export interface PdfPage {
	view: number[];
	objs: PdfObjects;
	commonObjs: PdfObjects;
	getOperatorList(): Promise<PdfOperatorList>;
	getTextContent(): Promise<PdfTextContent>;
	getAnnotations(): Promise<PdfAnnotation[]>;
}

export interface PdfDocument {
	numPages: number;
	getPage(n: number): Promise<PdfPage>;
}

export interface PdfLoadingTask {
	promise: Promise<PdfDocument>;
	destroy(): Promise<void>;
}

export interface PdfJsModule {
	OPS: Record<string, number>;
	getDocument(params: {
		data: Uint8Array;
		verbosity?: number;
		isEvalSupported?: boolean;
	}): PdfLoadingTask;
}

// pdfjs-dist распространяется только как ESM. Проект собирается в CommonJS, где
// import() транспилируется в require, поэтому загружаем модуль нативным
// require(esm) Node.js (>= 22.12). Под Jest обычный createRequire перехвачен его
// module registry (который не умеет ESM), поэтому берём настоящий core-модуль
// через process.getBuiltinModule (Node >= 22.3) — он обходит любые патчи.
type ModuleCore = { createRequire: typeof createRequire };

function nativeCreateRequire(): NodeJS.Require {
	const getBuiltin = (process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown })
		.getBuiltinModule;
	const moduleCore = (getBuiltin?.call(process, 'node:module') as ModuleCore) ?? { createRequire };

	return moduleCore.createRequire(__filename);
}

let cached: PdfJsModule | null = null;

export function loadPdfJs(): PdfJsModule {
	if (!cached) {
		cached = nativeCreateRequire()('pdfjs-dist/legacy/build/pdf.mjs') as PdfJsModule;
	}

	return cached;
}
