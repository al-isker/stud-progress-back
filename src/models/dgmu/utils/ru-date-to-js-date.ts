export const ruDateToJSDate = (ruDate: string) => {
	const [DD, MM, YYYY] = ruDate.split('.');

	return new Date(+YYYY, +MM - 1, +DD);
};
