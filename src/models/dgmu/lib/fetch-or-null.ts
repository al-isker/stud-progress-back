const TIMEOUT = 30000;

export async function fetchOrNull(
	input: RequestInfo | URL,
	init?: RequestInit
) {
	const abortController = new AbortController();

	const timeoutId = setTimeout(() => {
		abortController.abort();
	}, TIMEOUT);

	try {
		const res = await fetch(input, {
			...init,
			signal: abortController.signal
		});

		if (!res.ok) {
			if (res.status >= 400 && res.status < 600) {
				throw Error();
			}
		}
		return res;
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}
