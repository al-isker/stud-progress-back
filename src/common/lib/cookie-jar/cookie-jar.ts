import * as cookie from 'cookie';

export class CookieJar {
	private cookieMap: Map<string, string>;

	constructor(initialCookie?: Record<string, string>) {
		this.cookieMap = new Map(initialCookie && Object.entries(initialCookie));
	}

	getValue(name: string) {
		return this.cookieMap.get(name);
	}

	getValues() {
		return Object.fromEntries(this.cookieMap);
	}

	getStringify() {
		return cookie.stringifyCookie(this.getValues());
	}

	setCookie(setCookieList: string[]) {
		for (const setCookieItem of setCookieList) {
			const parsedSetCookieItem = cookie.parseSetCookie(setCookieItem);

			this.cookieMap.set(parsedSetCookieItem.name, parsedSetCookieItem.value);
		}
	}
}
