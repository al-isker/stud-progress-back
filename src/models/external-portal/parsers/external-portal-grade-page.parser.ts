import { ControlType, GradeStatus } from '@prisma/client';
import * as cheerio from 'cheerio';
import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { Injectable } from '@nestjs/common';
import { ExternalPortalSubjectListWithGradeByAllSemesters } from '../types/external-portal-subject-list-with-grade-by-all-semesters.type';
import {
	ExternalPortalSubjectListWithGrade,
	ExternalPortalSubjectWithGrade
} from '../types/external-portal-subject-list-with-grade.type';
import { ruDateToJSDate } from '../utils/ru-date-to-js-date';

@Injectable()
export class ExternalPortalGradePageParser {
	private readonly markMap = {
		Неудовлетворительно: 2,
		Удовлетворительно: 3,
		Хорошо: 4,
		Отлично: 5
	};

	private readonly controlTypeMap = {
		Зачет: ControlType.TEST,
		'Дифференцированный зачет': ControlType.GRADED_TEST,
		Экзамен: ControlType.EXAM
	};

	private readonly statusMap = {
		'Не зачтено': GradeStatus.FAIL,
		Зачтено: GradeStatus.PASS,
		Неудовлетворительно: GradeStatus.FAIL,
		Удовлетворительно: GradeStatus.PASS,
		Хорошо: GradeStatus.PASS,
		Отлично: GradeStatus.PASS
	};

	parseBySemester(page: string, semester: number): ExternalPortalSubjectListWithGrade {
		const $ = cheerio.load(page);

		return $(`#tab-0-${semester - 1} tbody tr`)
			.map((_, subjectEl) => {
				const subjectWithGrade: Partial<ExternalPortalSubjectWithGrade> = {};

				const handleValue = (value: string | null) => {
					return value.length > 0 ? value : null;
				};

				const [n, name, controlType, result, z, h, date] = $(subjectEl)
					.find('td')
					.get()
					.map(item => handleValue($(item).text()));

				subjectWithGrade.name = name;
				subjectWithGrade.controlType = this.controlTypeMap[controlType] ?? null;
				subjectWithGrade.date = isExist(date) ? ruDateToJSDate(date) : null;

				if (result) {
					subjectWithGrade.status = this.statusMap[result] ?? GradeStatus.EMPTY;
					subjectWithGrade.mark = this.markMap[result] ?? null;
				} else {
					subjectWithGrade.status = GradeStatus.EMPTY;
					subjectWithGrade.mark = null;
				}

				return subjectWithGrade as ExternalPortalSubjectWithGrade;
			})
			.get();
	}

	parseAllSemesters(page: string): ExternalPortalSubjectListWithGradeByAllSemesters {
		return Array(12)
			.fill(null)
			.map((_, index) => {
				const semester = index + 1;

				return {
					semester,
					subjectList: this.parseBySemester(page, semester)
				};
			});
	}
}
