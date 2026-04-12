import * as cheerio from 'cheerio';
import { CookieJar } from 'src/common/lib/cookie-jar/cookie-jar';
import {
	BadGatewayException,
	GatewayTimeoutException,
	Injectable,
	UnauthorizedException
} from '@nestjs/common';
import { ExternalPortalStudentData } from './types/external-portal-student-data.type';
import { objectToFormData } from './utils/object-to-form-data';

@Injectable()
export class ExternalPortalRouterService {
	private baseUrl = 'https://lk.dgmu.ru';
	private fetchTimeout = 60000;

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
				console.log(res);
				throw Error();
			}

			return res;
		} catch (error: any) {
			if (error.name === 'AbortError') {
				throw new GatewayTimeoutException();
			}

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

	async getAuthorizedCookie(data: Pick<ExternalPortalStudentData, 'fullName' | 'password'>) {
		const cookieJar = new CookieJar();

		const loginPageRes = await this.request(`${this.baseUrl}/user/sign-in/login`);

		cookieJar.applySetCookie(loginPageRes.headers.getSetCookie());

		const loginPageHTML = await loginPageRes.text();
		const loginPageCheerio = cheerio.load(loginPageHTML);

		const csrf = loginPageCheerio('input[name="_csrf"]').val() as string;

		const loginBody = {
			_csrf: csrf,
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

		cookieJar.applySetCookie(loginRes.headers.getSetCookie());

		const loginHTML = await loginRes.text();
		const loginCheerio = cheerio.load(loginHTML);

		const formErrorText = loginCheerio('.field-loginform-password .invalid-feedback').text();

		if (formErrorText) {
			throw new UnauthorizedException('Неверные ФИО и/или пароль');
		}

		// добавить проверку статуса ответа на login

		return cookieJar.getStringify();
	}

	async getGradePage(cookie: string) {
		const cookieJar = new CookieJar(cookie);

		const gradePageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/grade`, {
				headers: { cookie: cookieJar.getStringify() }
			})
		);

		return await gradePageRes.text();
	}

	async getEventsPage(cookie: string, semester: number) {
		const cookieJar = new CookieJar(cookie);

		const eventsPageRes = this.unauthorizedInterceptor(
			await this.request(`${this.baseUrl}/student/journal`, {
				headers: { cookie: cookieJar.getStringify() }
			})
		);

		cookieJar.applySetCookie(eventsPageRes.headers.getSetCookie());

		const eventsPageHTML = await eventsPageRes.text();
		const eventsPageCheerio = cheerio.load(eventsPageHTML);

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

		cookieJar.applySetCookie(planRes.headers.getSetCookie());

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

		cookieJar.applySetCookie(groupRes.headers.getSetCookie());

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
