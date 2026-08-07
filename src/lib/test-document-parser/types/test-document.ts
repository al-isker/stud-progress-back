/** Поддерживаемый тип вопроса. */
export type QuestionType = 'single' | 'multiple' | 'matching';

/** Вариант ответа. */
export interface Option {
	/** Порядковый номер варианта в вопросе, начиная с 1. */
	index: number;
	text: string;
	/** Помечен ли вариант как правильный (вычисляется из признака-указателя). */
	isCorrect: boolean;
}

/** Вопрос с выбором одного или нескольких правильных вариантов. */
export interface ChoiceQuestion {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
	/** single — ровно один правильный вариант; multiple — два и более. */
	type: 'single' | 'multiple';
	options: Option[];
}

/** Одна установленная пара matching-вопроса. */
export interface MatchingPair {
	left: string;
	right: string;
}

/** Вопрос на установление соответствия. */
export interface MatchingQuestion {
	/** Порядковый номер вопроса в документе, начиная с 1. */
	index: number;
	text: string;
	type: 'matching';
	pairs: MatchingPair[];
}

/** Любой поддерживаемый вопрос тестового документа. */
export type Question = ChoiceQuestion | MatchingQuestion;

/** Результат успешного парсинга — набор вопросов. */
export interface TestDocument {
	questions: Question[];
}
