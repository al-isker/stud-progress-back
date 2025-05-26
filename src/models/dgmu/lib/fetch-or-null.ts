const TIMEOUT = 20000;

export async function fetchOrNull(
	input: RequestInfo | URL,
	init?: RequestInit
) {
	const abortController = new AbortController();

	const timeoutId = setTimeout(() => {
		abortController.abort();
	}, TIMEOUT);

	try {
		return await fetch(input, {
			...init,
			signal: abortController.signal
		});
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
}
