import { parseCookie, parseSetCookie, stringifyCookie } from 'cookie';

export class CookieJar {
	private cookieMap: Map<string, string>;

	constructor(initialCookie?: string) {
		this.cookieMap = new Map(initialCookie && Object.entries(parseCookie(initialCookie)));
	}

	getValue(name: string) {
		return this.cookieMap.get(name);
	}

	getValues() {
		return Object.fromEntries(this.cookieMap);
	}

	getStringify() {
		return stringifyCookie(this.getValues());
	}

	applyCookie(cookie: string) {
		const parsedCookie = parseCookie(cookie);

		for (const [parsedCookieName, parsedCookieValue] of Object.entries(parsedCookie)) {
			this.cookieMap.set(parsedCookieName, parsedCookieValue);
		}
	}

	applySetCookie(setCookieList: string[]) {
		for (const setCookieItem of setCookieList) {
			const parsedSetCookieItem = parseSetCookie(setCookieItem);

			if (parsedSetCookieItem.value === 'deleted') {
				this.cookieMap.delete(parsedSetCookieItem.name);
			} else {
				this.cookieMap.set(parsedSetCookieItem.name, parsedSetCookieItem.value);
			}
		}
	}
}
