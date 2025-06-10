import * as cheerio from 'cheerio';
import {
	BadGatewayException,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import { fetchOrNull } from './lib/fetch-or-null';
import { DgmuStudentData } from './types/dgmu-student-data.type';
import { objectToFormData } from './utils/object-to-form-data';

@Injectable()
export class DgmuRouterService {
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

	async getSessid(data: DgmuStudentData) {
		const startRes = await fetchOrNull('https://lk.dgmu.ru/user/sign-in/login');

		if (startRes === null) {
			throw new BadGatewayException();
		}

		const startPage = await startRes.text();
		const startDocument = cheerio.load(startPage);

		const _csrfForm = startDocument('[name="_csrf"]').val() as string;
		const _csrfCookie = this.parseCookie(startRes.headers, '_csrf');

		const authRes = await fetchOrNull('https://lk.dgmu.ru/user/sign-in/login', {
			method: 'POST',
			body: objectToFormData({
				_csrf: _csrfForm,
				'LoginForm[identity]': data.fullName,
				'LoginForm[password]': data.password
			}),
			redirect: 'manual',
			headers: {
				cookie: _csrfCookie,
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		if (authRes === null) {
			throw new BadGatewayException();
		}

		const sessid = this.parseCookie(authRes.headers, 'LKSESSID');

		const usersetRes = await fetchOrNull(
			'https://lk.dgmu.ru/user/sign-in/userset?role=Student',
			{
				headers: { cookie: sessid }
			}
		);

		if (usersetRes === null) {
			throw new BadGatewayException();
		}

		const usersetPage = await usersetRes.text();

		const usersetTitle = cheerio.load(usersetPage)('title').text().trim();

		if (usersetTitle !== 'ЛК ДГМУ') {
			throw new UnauthorizedException('Неверные ФИО и/или пароль');
		}

		return sessid;
	}

	async getGradePage(sessid: string) {
		const gradeRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/grade?_referrer=%2Fstudent%2Findex',
			{
				headers: { cookie: sessid }
			}
		);

		if (gradeRes === null) {
			throw new BadGatewayException();
		}

		return await gradeRes.text();
	}

	async getEventsPage(sessid: string, semester: number) {
		const eventsRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/journal?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: sessid } }
		);

		if (eventsRes === null) {
			throw new BadGatewayException();
		}

		const eventsPage = await eventsRes.text();
		const eventsDocument = cheerio.load(eventsPage);

		const csrfCookie = this.parseCookie(eventsRes.headers, '_csrf');
		const csrfForm = eventsDocument('input[name="_csrf"]').val() as string;
		const cafId = eventsDocument('select[name="caf_id"]').val() as string;
		const semesterId = `000000000${semester + 1}`.slice(-9);

		const planRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/vedomost/ap?_referrer=%2Fstudent%2Fjournal',
			{
				method: 'POST',
				body: objectToFormData({
					'depdrop_parents[0]': cafId,
					'depdrop_all_params[caf_id]': cafId
				}),
				headers: {
					cookie: `${sessid}; ${csrfCookie}`,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfForm
				}
			}
		);

		if (planRes === null) {
			throw new BadGatewayException();
		}

		const planId = (await planRes.json()).selected.id;

		const groupRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/vedomost/groups?_referrer=%2Fstudent%2Fjournal',
			{
				method: 'POST',
				body: objectToFormData({
					'depdrop_parents[0]': cafId,
					'depdrop_parents[1]': planId,
					'depdrop_all_params[caf_id]': cafId,
					'depdrop_all_params[plan_id]': planId
				}),
				headers: {
					cookie: `${sessid}; ${csrfCookie}`,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfForm
				}
			}
		);

		if (groupRes === null) {
			throw new BadGatewayException();
		}

		const groupId = (await groupRes.json()).selected.id;

		const eventsBySemesterRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/journal',
			{
				method: 'POST',
				body: objectToFormData({
					_csrf: csrfForm,
					plan_id: planId,
					caf_id: cafId,
					group_id: groupId,
					semester_id: semesterId
				}),
				headers: {
					cookie: `${sessid}; ${csrfCookie}`,
					'content-type': 'application/x-www-form-urlencoded'
				}
			}
		);

		if (eventsBySemesterRes === null) {
			throw new BadGatewayException();
		}

		return await eventsBySemesterRes.text();
	}
}
