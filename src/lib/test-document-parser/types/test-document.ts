/** Тип вопроса по количеству правильных ответов. */
export type QuestionType = 'single' | 'multiple';

/** Вариант ответа. */
export interface Option {
	/** Порядковый номер варианта в вопросе, начиная с 1. */
	index: number;
	text: string;
	/** Помечен ли вариант как правильный (вычисляется из признака-указателя). */
	isCorrect: boolean;
}

/** Вопрос с вариантами ответа. */
export interface Question {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
	/** single — ровно один правильный вариант; multiple — два и более. */
	type: QuestionType;
	options: Option[];
}

/** Результат успешного парсинга — набор вопросов. */
export interface TestDocument {
	questions: Question[];
}
