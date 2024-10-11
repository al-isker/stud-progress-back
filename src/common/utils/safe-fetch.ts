export const safeFetch = async (url: string | URL, init?: RequestInit) => {
	const res = await fetch(url, init);

	console.log(`status | ${res.status}`);

	return res;

	// if (res.status >= 400) {
	// 	throw new ServiceUnavailableException('Сервис временно недоступен');
	// } else {
	// 	return res;
	// }
};
