export const objectToFormData = (object: Record<string, any>) => {
	return new URLSearchParams(object).toString();
};
