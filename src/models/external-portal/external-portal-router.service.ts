import * as cheerio from 'cheerio';
import * as cookie from 'cookie';
import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
import { fetchOrNull } from './lib/fetch-or-null';
import { ExternalPortalStudentData } from './types/external-portal-student-data.type';
import { objectToFormData } from './utils/object-to-form-data';

@Injectable()
export class ExternalPortalRouterService {
	private csrfCookieName = '_csrf';
	private sessionIdCookieName = 'LKSESSID';

	async getSessionId(data: ExternalPortalStudentData) {
		const loginPageRes = await fetchOrNull('https://lk.dgmu.ru/user/sign-in/login');

		if (loginPageRes === null) {
			throw new BadGatewayException();
		}

		const loginPage = await loginPageRes.text();
		const loginPageCheerio = cheerio.load(loginPage);

		const csrfInputValue = loginPageCheerio('[name="_csrf"]').val() as string;

		const loginPageSetCookie = loginPageRes.headers
			.getSetCookie()
			.map(item => cookie.parseSetCookie(item));

		const csrfSetCookie = loginPageSetCookie.find(item => {
			return item.name === this.csrfCookieName;
		});

		const csrfSetCookieValue = csrfSetCookie?.value;

		const loginBody = objectToFormData({
			_csrf: csrfInputValue,
			'LoginForm[identity]': data.fullName,
			'LoginForm[password]': data.password,
			'LoginForm[rememberMe]': 1
		});

		const loginCookie = cookie.stringifyCookie({
			[this.csrfCookieName]: csrfSetCookieValue
		});

		const loginRes = await fetchOrNull('https://lk.dgmu.ru/user/sign-in/login', {
			method: 'POST',
			redirect: 'manual',
			body: loginBody,
			headers: {
				cookie: loginCookie,
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		if (loginRes === null) {
			throw new BadGatewayException();
		}

		const loginSetCookie = loginRes.headers.getSetCookie().map(item => cookie.parseSetCookie(item));

		const sessionIdSetCookie = loginSetCookie.find(item => {
			return item.name === this.sessionIdCookieName;
		});

		const sessionId = sessionIdSetCookie?.value;

		const usersetPageCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		const usersetPageRes = await fetchOrNull(
			'https://lk.dgmu.ru/user/sign-in/userset?role=Student',
			{ headers: { cookie: usersetPageCookie } }
		);

		if (usersetPageRes === null) {
			throw new BadGatewayException();
		}

		const usersetPage = await usersetPageRes.text();
		const usersetPageCheerio = cheerio.load(usersetPage);

		const usersetPageTitle = usersetPageCheerio('title').text().trim();

		if (usersetPageTitle !== 'ЛК ДГМУ') {
			throw new UnauthorizedException('Неверные ФИО и/или пароль');
		}

		return sessionId!;
	}

	async getGradePage(sessionId: string) {
		const gradePageCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		const gradePageRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/grade?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: gradePageCookie } }
		);

		if (gradePageRes === null) {
			throw new BadGatewayException();
		}

		return await gradePageRes.text();
	}

	async getEventsPage(sessionId: string, semester: number) {
		const eventsPageReqCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		const eventsPageRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/journal?_referrer=%2Fstudent%2Findex',
			{ headers: { cookie: eventsPageReqCookie } }
		);

		if (eventsPageRes === null) {
			throw new BadGatewayException();
		}

		const eventsPage = await eventsPageRes.text();
		const eventsPageCheerio = cheerio.load(eventsPage);

		const csrfInputValue = eventsPageCheerio('input[name="_csrf"]').val() as string;
		const cafId = eventsPageCheerio('select[name="caf_id"]').val() as string;

		const eventsPageSetCookie = eventsPageRes.headers
			.getSetCookie()
			.map(item => cookie.parseSetCookie(item));

		const csrfSetCookie = eventsPageSetCookie.find(item => {
			return item.name === this.csrfCookieName;
		});

		const csrfSetCookieValue = csrfSetCookie?.value;

		const planBody = objectToFormData({
			'depdrop_parents[0]': cafId,
			'depdrop_all_params[caf_id]': cafId
		});

		const eventsCookie = cookie.stringifyCookie({
			[this.csrfCookieName]: csrfSetCookieValue,
			[this.sessionIdCookieName]: sessionId
		});

		const planRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/vedomost/ap?_referrer=%2Fstudent%2Fjournal',
			{
				method: 'POST',
				body: planBody,
				headers: {
					cookie: eventsCookie,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfInputValue
				}
			}
		);

		if (planRes === null) {
			throw new BadGatewayException();
		}

		const plan = await planRes.json();

		const planId = plan.selected.id;

		const groupBody = objectToFormData({
			'depdrop_parents[0]': cafId,
			'depdrop_parents[1]': planId,
			'depdrop_all_params[caf_id]': cafId,
			'depdrop_all_params[plan_id]': planId
		});

		const groupRes = await fetchOrNull(
			'https://lk.dgmu.ru/student/vedomost/groups?_referrer=%2Fstudent%2Fjournal',
			{
				method: 'POST',
				body: groupBody,
				headers: {
					cookie: eventsCookie,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfInputValue
				}
			}
		);

		if (groupRes === null) {
			throw new BadGatewayException();
		}

		const group = await groupRes.json();

		const groupId = group.selected.id;

		const semesterId = `000000000${semester + 1}`.slice(-9);

		const eventsBySemesterBody = objectToFormData({
			_csrf: csrfInputValue,
			plan_id: planId,
			caf_id: cafId,
			group_id: groupId,
			semester_id: semesterId
		});

		const eventsBySemesterRes = await fetchOrNull('https://lk.dgmu.ru/student/journal', {
			method: 'POST',
			body: eventsBySemesterBody,
			headers: {
				cookie: eventsCookie,
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		if (eventsBySemesterRes === null) {
			throw new BadGatewayException();
		}

		return await eventsBySemesterRes.text();
	}
}
