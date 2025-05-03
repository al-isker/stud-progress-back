import { Injectable } from '@nestjs/common';
import { ControlType, GradeStatus, RatingStatus, Student } from '@prisma/client';
import * as cheerio from 'cheerio';
import { ruDateToJSDate } from 'src/common/utils/ru-date-to-js-date';
import { DgmuHelper } from './dgmu.helper';
import { AllSubjectsWithGradeDto } from './dto/all-subjects-with-grade.dto';
import { SubjectsWithGradeDto, SubjectsWithGradeDtoItem } from './dto/subjects-with-grade.dto';
import { RatingDtoItem, SubjectsWithRatingDto } from './dto/subjects-with-rating.dto';

@Injectable()
export class DgmuService extends DgmuHelper {
	constructor() {
		super()
	}

	private parseSubjectsWithGrade($: cheerio.CheerioAPI, semester: Student['semester']) {
		return $(`#tab-0-${semester - 1} tbody tr`)
			.map((_, subjectEl) => {
				const gradeItem: Partial<SubjectsWithGradeDtoItem> = {}

				const handleValue = (value: string | null) => value.length > 0 ? value : null

				const [n, name, controlType, result, z, h, date] = $(subjectEl)
					.find('td').get()
					.map(item => handleValue($(item).text()))

				const markMap: {[key: string]: number} = {
					'Неудовлетворительно': 2,
					'Удовлетворительно': 3,
					'Хорошо': 4,
					'Отлично': 5
				}

				const controlTypeMap: {[key: string]: ControlType} = {
					'Зачет': ControlType.TEST,
					'Дифференцированный зачет': ControlType.GRADED_TEST,
					'Экзамен': ControlType.EXAM
				}

				const statusMap: {[key: string]: GradeStatus} = {
					'Зачтено': GradeStatus.PASS,
					'Удовлетворительно': GradeStatus.PASS,
					'Хорошо': GradeStatus.PASS,
					'Отлично': GradeStatus.PASS,
					'Не зачтено': GradeStatus.FAIL,
					'Неудовлетворительно': GradeStatus.FAIL
				}

				gradeItem.name = name
				gradeItem.controlType = controlTypeMap[controlType] ?? null
				gradeItem.date = ruDateToJSDate(date)

				if (result) {
					gradeItem.status = statusMap[result] ?? GradeStatus.EMPTY
					gradeItem.mark = markMap[result] ?? null
				} else {
					gradeItem.status = GradeStatus.EMPTY
					gradeItem.mark = null
				}
		
				return gradeItem as Required<SubjectsWithGradeDtoItem>
			})
			.get()
	}

	private parseSubjectsWithRating($: cheerio.CheerioAPI) {
		return $('#journal_tag .mobileView .accordion-item')
			.map((_, subjectEl) => {
				const h2 = $(subjectEl).find('h2').text()
				const name = h2.slice(0, h2.indexOf('(') - 1)

				const rating = $(subjectEl)
					.find('tbody tr').get()
					.map(item => {
						const ratingItem: Partial<RatingDtoItem> = {}

						const [dateEl, markEl] = $(item).find('td').get()

						const dateStr = $(dateEl).text().trim()
						const markStr = $(markEl).text().trim()
						const markClass = $(markEl).attr('class').trim()

						ratingItem.date = dateStr ? ruDateToJSDate(dateStr) : null

						if (markClass === 'propusk') {
							ratingItem.status = RatingStatus.ABSENCE
							ratingItem.mark = null
						}
						else if (markClass === 'upworked') {
							ratingItem.status = RatingStatus.UPWORKED
							ratingItem.mark = null
						}
						else {
							const mark = Number(markStr)

							if (markStr.length > 0 && !isNaN(mark)) {
								ratingItem.status = RatingStatus.MARK
								ratingItem.mark = mark
							} else {
								ratingItem.mark = null
								ratingItem.status = RatingStatus.EMPTY
							}
						}

						return ratingItem as Required<RatingDtoItem>
					})

				return { name, rating }
			})
			.get()
	}

	private async getSubjectsWithGrade(sessid: string, semester: Student['semester']) {
		const gradePage = await this.getGradePage(sessid)
		
		const $ = cheerio.load(gradePage)

		return this.parseSubjectsWithGrade($, semester)
	}

	private async getAllSubjectsWithGrade(sessid: string) {
		const gradePage = await this.getGradePage(sessid)

		const $ = cheerio.load(gradePage)

		return Array(12).fill(null).map((_, index) => {
			const semester = index + 1

			const subjects = this.parseSubjectsWithGrade($, semester)

			return { semester, subjects }
		})
	}

	private async getSubjectsWithRating(sessid: string, semester: Student['semester']) {
		const ratingPage = await this.getRatingPage(sessid, semester)

		const $ = cheerio.load(ratingPage)

		return this.parseSubjectsWithRating($)
	}

	async findManyOrThrow<
		G extends boolean = false,
		AG extends boolean = false,
		R extends boolean = false
	>(
		dto: Pick<Student, 'fullName' | 'password' | 'semester'>,
		select?: {grade?: G, allGrade?: AG, rating?: R}
	) {
		const sessid = await this.getSessidOrThrow(dto)

		const [subjectsWithGrade, allSubjectsWithGrade, subjectsWithRating] = await Promise.all([
			select?.grade ? this.getSubjectsWithGrade(sessid, dto.semester) : null,
			select?.allGrade ? this.getAllSubjectsWithGrade(sessid) : null,
			select?.rating ? this.getSubjectsWithRating(sessid, dto.semester) : null,
		])

		if (!select?.grade && !select?.allGrade && !select?.rating) return

		const result: Record<string, any> = {}

		if (subjectsWithGrade) {
			result.subjectsWithGrade = subjectsWithGrade
		}

		if (allSubjectsWithGrade) {
			result.allSubjectsWithGrade = allSubjectsWithGrade
		}

		if (subjectsWithRating) {
			result.subjectsWithRating = subjectsWithRating
		}

		type Grade = {[key in G extends true ? 'subjectsWithGrade' : never]: SubjectsWithGradeDto}
		type GradeList = {[key in AG extends true ? 'allSubjectsWithGrade' : never]: AllSubjectsWithGradeDto}
		type Rating = {[key in R extends true ? 'subjectsWithRating' : never]: SubjectsWithRatingDto}

		type Result = Grade & GradeList & Rating

		return result as Result
	}
}
