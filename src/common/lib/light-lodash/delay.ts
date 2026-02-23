export const delay = async (ms: number) => {
	return new Promise<void>(res => {
		setTimeout(res, ms);
	});
};
