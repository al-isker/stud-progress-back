import { ControlType, EventStatus, GradeStatus } from '@prisma/client';
import * as cheerio from 'cheerio';
import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { Injectable } from '@nestjs/common';
import { DgmuRouterService } from './dgmu-router.service';
import { DgmuStudentData } from './types/dgmu-student-data.type';
import {
	DgmuEvent,
	DgmuSubjectListWithEventList
} from './types/dgmu-subject-list-with-event-list.type';
import { DgmuSubjectListWithGradeByAllSemesters } from './types/dgmu-subject-list-with-grade-by-all-semesters.type';
import {
	DgmuSubjectListWithGrade,
	DgmuSubjectWithGrade
} from './types/dgmu-subject-list-with-grade.type';
import { ruDateToJSDate } from './utils/ru-date-to-js-date';

@Injectable()
export class DgmuService {
	constructor(private dgmuRouterService: DgmuRouterService) {}

	private parseSubjectListWithGrade($: cheerio.CheerioAPI, semester: number) {
		return $(`#tab-0-${semester - 1} tbody tr`)
			.map((_, subjectEl) => {
				const subjectWithGrade: Partial<DgmuSubjectWithGrade> = {};

				const handleValue = (value: string | null) => {
					return value.length > 0 ? value : null;
				};

				const [n, name, controlType, result, z, h, date] = $(subjectEl)
					.find('td')
					.get()
					.map(item => handleValue($(item).text()));

				const markMap = {
					Неудовлетворительно: 2,
					Удовлетворительно: 3,
					Хорошо: 4,
					Отлично: 5
				};

				const controlTypeMap = {
					Зачет: ControlType.TEST,
					'Дифференцированный зачет': ControlType.GRADED_TEST,
					Экзамен: ControlType.EXAM
				};

				const statusMap = {
					Зачтено: GradeStatus.PASS,
					Удовлетворительно: GradeStatus.PASS,
					Хорошо: GradeStatus.PASS,
					Отлично: GradeStatus.PASS,
					'Не зачтено': GradeStatus.FAIL,
					Неудовлетворительно: GradeStatus.FAIL
				};

				subjectWithGrade.name = name;
				subjectWithGrade.controlType = controlTypeMap[controlType] ?? null;
				subjectWithGrade.date = isExist(date) ? ruDateToJSDate(date) : null;

				if (result) {
					subjectWithGrade.status = statusMap[result] ?? GradeStatus.EMPTY;
					subjectWithGrade.mark = markMap[result] ?? null;
				} else {
					subjectWithGrade.status = GradeStatus.EMPTY;
					subjectWithGrade.mark = null;
				}

				return subjectWithGrade as DgmuSubjectWithGrade;
			})
			.get();
	}

	private parseSubjectListWithEventList($: cheerio.CheerioAPI) {
		return $('#journal_tag .mobileView .accordion-item')
			.map((_, subjectEl) => {
				const h2 = $(subjectEl).find('h2').text();
				const name = h2.slice(0, h2.indexOf('(') - 1);

				const eventList = $(subjectEl)
					.find('tbody tr')
					.get()
					.map(item => {
						const event: Partial<DgmuEvent> = {};

						const [dateEl, markEl] = $(item).find('td').get();

						const dateStr = $(dateEl).text().trim();
						const markStr = $(markEl).text().trim();
						const markClass = $(markEl).attr('class').trim();

						event.date = isExist(dateStr) ? ruDateToJSDate(dateStr) : null;

						if (markClass === 'propusk') {
							event.status = EventStatus.ABSENCE;
							event.mark = null;
						} else if (markClass === 'upworked') {
							event.status = EventStatus.UPWORKED;
							event.mark = null;
						} else {
							const mark = Number(markStr);

							if (markStr.length > 0 && !isNaN(mark)) {
								event.status = EventStatus.MARK;
								event.mark = mark;
							} else {
								event.mark = null;
								event.status = EventStatus.EMPTY;
							}
						}

						return event as DgmuEvent;
					});

				return { name, eventList };
			})
			.get();
	}

	private async getSubjectListWithGrade(
		sessid: string,
		semester: number
	): Promise<DgmuSubjectListWithGrade> {
		const gradePage = await this.dgmuRouterService.getGradePage(sessid);

		const $ = cheerio.load(gradePage);

		return this.parseSubjectListWithGrade($, semester);
	}

	private async getSubjectListWithGradeByAllSemesters(
		sessid: string
	): Promise<DgmuSubjectListWithGradeByAllSemesters> {
		const gradePage = await this.dgmuRouterService.getGradePage(sessid);

		const $ = cheerio.load(gradePage);

		return Array(12)
			.fill(null)
			.map((_, index) => {
				const semester = index + 1;

				const subjectList = this.parseSubjectListWithGrade($, semester);

				return { semester, subjectList };
			});
	}

	private async getSubjectListWithEventList(
		sessid: string,
		semester: number
	): Promise<DgmuSubjectListWithEventList> {
		const eventsPage = await this.dgmuRouterService.getEventsPage(
			sessid,
			semester
		);

		const $ = cheerio.load(eventsPage);

		return this.parseSubjectListWithEventList($);
	}

	async findMany<
		G extends boolean = false,
		GA extends boolean = false,
		E extends boolean = false
	>(
		data: DgmuStudentData,
		include?: { grade?: G; gradeByAllSemesters?: GA; eventList?: E }
	) {
		const sessid = await this.dgmuRouterService.getSessid(data);

		const [
			subjectListWithGrade,
			subjectListWithGradeByAllSemesters,
			subjectListWithEventList
		] = await Promise.all([
			include?.grade
				? this.getSubjectListWithGrade(sessid, data.semester)
				: null,
			include?.gradeByAllSemesters
				? this.getSubjectListWithGradeByAllSemesters(sessid)
				: null,
			include?.eventList
				? this.getSubjectListWithEventList(sessid, data.semester)
				: null
		]);

		if (
			!include?.grade &&
			!include?.gradeByAllSemesters &&
			!include?.eventList
		) {
			return;
		}

		const result: Record<string, unknown> = {};

		if (subjectListWithGrade) {
			result.subjectListWithGrade = subjectListWithGrade;
		}

		if (subjectListWithGradeByAllSemesters) {
			result.subjectListWithGradeByAllSemesters =
				subjectListWithGradeByAllSemesters;
		}

		if (subjectListWithEventList) {
			result.subjectListWithEventList = subjectListWithEventList;
		}

		type Grade = {
			[key in G extends true
				? 'subjectListWithGrade'
				: never]: typeof subjectListWithGrade;
		};
		type GradeByAllSemesters = {
			[key in GA extends true
				? 'subjectListWithGradeByAllSemesters'
				: never]: typeof subjectListWithGradeByAllSemesters;
		};
		type EventList = {
			[key in E extends true
				? 'subjectListWithEventList'
				: never]: typeof subjectListWithEventList;
		};

		type Result = Grade & GradeByAllSemesters & EventList;

		return result as Result;
	}
}
