import * as cheerio from 'cheerio';
import * as cookie from 'cookie';
import { BadGatewayException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ExternalPortalStudentData } from './types/external-portal-student-data.type';
import { objectToFormData } from './utils/object-to-form-data';

@Injectable()
export class ExternalPortalRouterService {
	private baseUrl = 'https://lk.dgmu.ru';
	private fetchTimeout = 60000;
	private csrfCookieName = '_csrf';
	private sessionIdCookieName = 'LKSESSID';

	private async request(input: RequestInfo | URL, init?: RequestInit) {
		const abortController = new AbortController();

		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, this.fetchTimeout);

		try {
			const res = await fetch(input, {
				...init,
				signal: abortController.signal
			});

			if (!res.ok && res.status >= 400 && res.status < 600) {
				throw Error();
			}

			return res;
		} catch {
			throw new BadGatewayException();
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private unauthorizedInterceptor<T extends Response>(res: T) {
		if (res.redirected && res.url.startsWith(`${this.baseUrl}/user/sign-in/login`)) {
			throw new UnauthorizedException('Session id expired');
		}

		return res;
	}

	async getSessionId(data: Pick<ExternalPortalStudentData, 'fullName' | 'password'>) {
		const loginPageRes = await this.request(`${this.baseUrl}/user/sign-in/login`);

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

		const loginRes = await this.request(`${this.baseUrl}/user/sign-in/login`, {
			method: 'POST',
			redirect: 'manual',
			body: loginBody,
			headers: {
				cookie: loginCookie,
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		if (loginRes.status !== HttpStatus.FOUND) {
			throw new UnauthorizedException('Неверные ФИО и/или пароль');
		}

		const loginSetCookie = loginRes.headers.getSetCookie().map(item => cookie.parseSetCookie(item));

		const sessionIdSetCookie = loginSetCookie.find(item => {
			return item.name === this.sessionIdCookieName;
		});

		const sessionId = sessionIdSetCookie?.value;

		const usersetPageCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		await this.request(`${this.baseUrl}/user/sign-in/userset?role=Student`, {
			headers: { cookie: usersetPageCookie }
		});

		return sessionId!;
	}

	async getGradePage(sessionId: string) {
		const gradePageCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		const gradePageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/grade`, {
				headers: { cookie: gradePageCookie }
			})
		);

		return await gradePageRes.text();
	}

	async getEventsPage(sessionId: string, semester: number) {
		const eventsPageReqCookie = cookie.stringifyCookie({
			[this.sessionIdCookieName]: sessionId
		});

		const eventsPageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/journal`, {
				headers: { cookie: eventsPageReqCookie }
			})
		);

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

		const planRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/vedomost/ap`, {
				method: 'POST',
				body: planBody,
				headers: {
					cookie: eventsCookie,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfInputValue
				}
			})
		);

		const plan = await planRes.json();

		const planId = plan.selected.id;

		const groupBody = objectToFormData({
			'depdrop_parents[0]': cafId,
			'depdrop_parents[1]': planId,
			'depdrop_all_params[caf_id]': cafId,
			'depdrop_all_params[plan_id]': planId
		});

		const groupRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/vedomost/groups`, {
				method: 'POST',
				body: groupBody,
				headers: {
					cookie: eventsCookie,
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrfInputValue
				}
			})
		);

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

		const eventsBySemesterRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/journal`, {
				method: 'POST',
				body: eventsBySemesterBody,
				headers: {
					cookie: eventsCookie,
					'content-type': 'application/x-www-form-urlencoded'
				}
			})
		);

		return await eventsBySemesterRes.text();
	}
}
