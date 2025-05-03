import { Student } from '@prisma/client';
import * as cheerio from 'cheerio';
import { objectToFormData } from 'src/common/utils/object-to-form-data';

import {
	ServiceUnavailableException,
	UnauthorizedException
} from '@nestjs/common';

export class DgmuHelper {
	private parseCookie(headers: Headers, key: string) {
		const cookies = headers.get('set-cookie');

		const startIndex = cookies.indexOf(key);
		if (startIndex === -1) {
			return null;
		}

		let cookie = cookies.slice(startIndex);

		const endIndex = cookie.indexOf(';');
		if (endIndex !== -1) {
			cookie = cookie.slice(0, endIndex);
		}

		return cookie;
	}

	private getInputValue(dom: string, name: string) {
		const $ = cheerio.load(dom);
		const value = $(`[name="${name}"]`).val();

		return value as string;
	}

	protected async getSessidOrThrow(
		dto: Pick<Student, 'fullName' | 'password'>
	) {
		const startRes = await fetch('https://lk.dgmu.ru/user/sign-in/login');

		const startPage = await startRes.text();

		if (startRes.status !== 200) {
			throw new ServiceUnavailableException('Сервис временно недоступен');
		}

		const _csrfForm = this.getInputValue(startPage, '_csrf');
		const _csrfCookie = this.parseCookie(startRes.headers, '_csrf');

		const authRes = await fetch('https://lk.dgmu.ru/user/sign-in/login', {
			method: 'POST',
			body: objectToFormData({
				_csrf: _csrfForm,
				'LoginForm[identity]': dto.fullName,
				'LoginForm[password]': dto.password
			}),
			redirect: 'manual',
			headers: {
				cookie: _csrfCookie,
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		const sessid = this.parseCookie(authRes.headers, 'LKSESSID');

		const usersetRes = await fetch(
			'https://lk.dgmu.ru/user/sign-in/userset?role=Student',
			{
				headers: { cookie: sessid }
			}
		);

		const usersetPage = await usersetRes.text();

		const usersetTitle = cheerio.load(usersetPage)('title').text().trim();

		if (usersetTitle !== 'ЛК ДГМУ') {
			throw new UnauthorizedException('Неверные ФИО и/или пароль');
		}

		return sessid;
	}

	protected async getGradePage(sessid: string) {
		const gradeRes = await fetch(
			'https://lk.dgmu.ru/student/grade?_referrer=%2Fstudent%2Findex',
			{
				headers: { cookie: sessid }
			}
		);

		return await gradeRes.text();
	}

	protected async getRatingPage(sessid: string, semester: Student['semester']) {
		const ratingRes = await fetch(
			'https://lk.dgmu.ru/student/journal?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: sessid } }
		);

		const ratingPage = await ratingRes.text();

		const _csrfCookie = this.parseCookie(ratingRes.headers, '_csrf');

		const _csrfForm = this.getInputValue(ratingPage, '_csrf');
		const plan_plan = this.getInputValue(ratingPage, 'plan_plan');
		const plan_semester = `000000000${semester + 1}`.slice(-9);

		const ratingBySemesterRes = await fetch(
			'https://lk.dgmu.ru/student/journal',
			{
				method: 'POST',
				body: objectToFormData({
					_csrf: _csrfForm,
					plan_semester,
					plan_plan
				}),
				headers: {
					cookie: `${sessid}; ${_csrfCookie}`,
					'content-type': 'application/x-www-form-urlencoded'
				}
			}
		);

		return await ratingBySemesterRes.text();
	}
}
