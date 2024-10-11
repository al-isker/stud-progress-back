export const parseCookie = (headers: Headers, key: string) => {
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
};
