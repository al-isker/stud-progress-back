import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Rating } from '@prisma/client';
import * as cheerio from 'cheerio';
import { objectToFormData } from 'src/common/utils/object-to-form-data';
import { parseCookie } from 'src/common/utils/parse-cookie';
import { ruDateToJSDate } from 'src/common/utils/ru-date-to-js-date';
import { safeFetch } from 'src/common/utils/safe-fetch';
import { StudentDto } from 'src/models/student/dto/student.dto';

@Injectable()
export class DgmuService {
	private getInputValue(dom: string, name: string) {
		const $ = cheerio.load(dom)
		const value = $(`[name="${name}"]`).val()

		return value as string
	}

	private async findLKSESSID(dto: StudentDto) {
		const startRes = await safeFetch('https://lk.dgmu.ru/user/sign-in/login')

		if(startRes.status !== 200) {
			throw new ServiceUnavailableException('Сервис временно недоступен')
		}

		const startDom = await startRes.text()

		const _csrfForm = this.getInputValue(startDom, '_csrf')
		const _csrfCookie = parseCookie(startRes.headers, '_csrf')

		const authRes = await safeFetch('https://lk.dgmu.ru/user/sign-in/login', {
			method: 'POST',
			redirect: 'manual',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: _csrfCookie
			},
			body: objectToFormData({
				_csrf: _csrfForm,
				'LoginForm[identity]': dto.fullName,
				'LoginForm[password]': dto.password
			})
		})

		const LKSESSID = parseCookie(authRes.headers, 'LKSESSID')

		const usersetRes = await safeFetch(
			'https://lk.dgmu.ru/user/sign-in/userset?role=Student',
			{ headers: { cookie: LKSESSID } }
		)

		const usersetRedirectDom = await usersetRes.text()
		const usersetRedirectTitle = cheerio.load(usersetRedirectDom)('title').text()
		
		if (usersetRedirectTitle.trim() !== 'Личные кабинеты ДГМУ') {
			throw new UnauthorizedException('Неверные ФИО и/или пароль')
		}
		return LKSESSID;
	}

	async verificationUser(dto: StudentDto) {
		await this.findLKSESSID(dto)
	}

	private async parseGrade(LKSESSID: string, semester: StudentDto['semester']) {
		const gradeRes = await safeFetch(
			'https://lk.dgmu.ru/student/grade?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: LKSESSID } }
		)

		const gradeDom = await gradeRes.text()
		const $ = cheerio.load(gradeDom)

		return $(`#tab-0-${semester - 1} tbody tr`)
			.map((_, row) => {
				const handleValue = (value: string) => value.length > 0 ? value : null; 
		
				const [name, type, mark, date] = $(row)
					.find('td').get()
					.map(cell => handleValue($(cell).text()))
		
				return { name, type, mark, date };
			})
			.get();
	}

	private async parseRating(LKSESSID: string, semester: StudentDto['semester']) {
		const ratingRes = await safeFetch(
			'https://lk.dgmu.ru/student/journal?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: LKSESSID } }
		)
		const ratingDom = await ratingRes.text()

		const _csrfCookie = parseCookie(ratingRes.headers, '_csrf')

		const _csrfForm = this.getInputValue(ratingDom, '_csrf')
		const plan_plan = this.getInputValue(ratingDom, 'plan_plan')
		const plan_semester = `000000000${semester + 1}`.slice(-9)

		const ratingSemesterRes = await safeFetch('https://lk.dgmu.ru/student/journal', {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				cookie: `${LKSESSID}; ${_csrfCookie}`,
			},
			body: objectToFormData({
				_csrf: _csrfForm,
				plan_semester,
				plan_plan
			})
		})

		const ratingSemesterDom = await ratingSemesterRes.text()
		const $ = cheerio.load(ratingSemesterDom)

		return $('#journal_tag .mobileView .accordion-item')
			.map((_, subjectEl) => {
				const h2 = $(subjectEl).find('h2').text()
				const name = h2.slice(0, h2.indexOf('(') - 1)

				const rating = $(subjectEl)
					.find('tbody tr').get()
					.map(item => {
						const ratingItem: Partial<Pick<Rating, 'date' | 'mark' | 'status'>> = {}

						const [dateEl, markEl] = $(item).find('td').get()

						const dateStr = $(dateEl).text().trim()
						const markStr = $(markEl).text().trim()
						const markClass = $(markEl).attr('class').trim()

						ratingItem.date = ruDateToJSDate(dateStr)

						if (markClass === 'propusk') {
							ratingItem.mark = null
							ratingItem.status = 'ABSENCE'
						} 
						else if (false) { // проверка на отработку без оценки
							ratingItem.mark = null
							ratingItem.status = 'UPWORKED'
						} 
						else if (markClass === 'upworked') {
							const mark = markStr.match(/\d+/)

							ratingItem.mark = mark ? Number(mark[0]) : null
							ratingItem.status = 'UPWORKED_WITH_MARK'
						}
						else {
							const mark = Number(markStr)

							if (markStr.length > 0 && !isNaN(mark)) {
								ratingItem.mark = mark
								ratingItem.status = 'MARK'
							} else {
								ratingItem.mark = null
								ratingItem.status = 'EMPTY'
							}
						}

						return ratingItem as Required<typeof ratingItem>
					})

				return { name, rating }
			}).get()
	}

	async findGrade(dto: StudentDto) {
		const LKSESSID = await this.findLKSESSID(dto)

		return this.parseGrade(LKSESSID, dto.semester)
	}

	async findRating(dto: StudentDto) {
		const LKSESSID = await this.findLKSESSID(dto)

		return this.parseRating(LKSESSID, dto.semester)
	}

	async findAll(dto: StudentDto) {
		const LKSESSID = await this.findLKSESSID(dto)

		const [grade, rating] = await Promise.all([
			this.parseGrade(LKSESSID, dto.semester),
			this.parseRating(LKSESSID, dto.semester)
		])

		return { grade, rating }
	}
}
