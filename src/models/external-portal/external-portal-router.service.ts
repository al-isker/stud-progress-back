import * as cheerio from 'cheerio';
import { CookieJar } from 'src/common/lib/cookie-jar/cookie-jar';
import { BadGatewayException, Injectable, UnauthorizedException } from '@nestjs/common';
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
		const cookieJar = new CookieJar();

		const loginPageRes = await this.request(`${this.baseUrl}/user/sign-in/login`);

		cookieJar.setCookie(loginPageRes.headers.getSetCookie());

		const loginPage = await loginPageRes.text();
		const loginPageCheerio = cheerio.load(loginPage);

		const csrfInputValue = loginPageCheerio('[name="_csrf"]').val() as string;

		const loginBody = {
			_csrf: csrfInputValue,
			'LoginForm[identity]': data.fullName,
			'LoginForm[password]': data.password,
			'LoginForm[rememberMe]': 1
		};

		const loginRes = await this.request(`${this.baseUrl}/user/sign-in/login`, {
			method: 'POST',
			redirect: 'manual',
			body: objectToFormData(loginBody),
			headers: {
				cookie: cookieJar.getStringify(),
				'content-type': 'application/x-www-form-urlencoded'
			}
		});

		cookieJar.setCookie(loginRes.headers.getSetCookie());

		// обработка на неправильные данные
		// if (loginRes.status !== HttpStatus.FOUND) {
		// 	throw new UnauthorizedException('Неверные ФИО и/или пароль');
		// }

		const sessionId = cookieJar.getValue(this.sessionIdCookieName);

		return sessionId;
	}

	async getGradePage(sessionId: string) {
		const cookieJar = new CookieJar({
			[this.sessionIdCookieName]: sessionId
		});

		const gradePageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/grade`, {
				headers: {
					cookie: cookieJar.getStringify()
				}
			})
		);

		return await gradePageRes.text();
	}

	async getEventsPage(sessionId: string, semester: number) {
		const cookieJar = new CookieJar({
			[this.sessionIdCookieName]: sessionId
		});

		const eventsPageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/journal`, {
				headers: {
					cookie: cookieJar.getStringify()
				}
			})
		);

		cookieJar.setCookie(eventsPageRes.headers.getSetCookie());

		const eventsPage = await eventsPageRes.text();
		const eventsPageCheerio = cheerio.load(eventsPage);

		const csrf = eventsPageCheerio('input[name="_csrf"]').val() as string;
		const cafId = eventsPageCheerio('select[name="caf_id"]').val() as string;

		const planBody = {
			'depdrop_parents[0]': cafId,
			'depdrop_all_params[caf_id]': cafId
		};

		const planRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/vedomost/ap`, {
				method: 'POST',
				body: objectToFormData(planBody),
				headers: {
					cookie: cookieJar.getStringify(),
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrf
				}
			})
		);

		cookieJar.setCookie(planRes.headers.getSetCookie());

		const plan = await planRes.json();

		const planId = plan.selected.id;

		const groupBody = {
			'depdrop_parents[0]': cafId,
			'depdrop_parents[1]': planId,
			'depdrop_all_params[caf_id]': cafId,
			'depdrop_all_params[plan_id]': planId
		};

		const groupRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/vedomost/groups`, {
				method: 'POST',
				body: objectToFormData(groupBody),
				headers: {
					cookie: cookieJar.getStringify(),
					'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
					'x-csrf-token': csrf
				}
			})
		);

		cookieJar.setCookie(groupRes.headers.getSetCookie());

		const group = await groupRes.json();

		const groupId = group.selected.id;

		const semesterId = `000000000${semester + 1}`.slice(-9);

		const eventsBySemesterBody = {
			_csrf: csrf,
			plan_id: planId,
			caf_id: cafId,
			group_id: groupId,
			semester_id: semesterId
		};

		const eventsBySemesterRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/journal`, {
				method: 'POST',
				body: objectToFormData(eventsBySemesterBody),
				headers: {
					cookie: cookieJar.getStringify(),
					'content-type': 'application/x-www-form-urlencoded'
				}
			})
		);

		return await eventsBySemesterRes.text();
	}
}
