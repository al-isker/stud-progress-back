export const ruDateToJSDate = (ruDate?: string) => {
	if (ruDate) {
		const [DD, MM, YYYY] = ruDate.split('.');

		return new Date(+YYYY, +MM - 1, +DD);
	}

	return null;
};
