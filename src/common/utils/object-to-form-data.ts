type DataType = {
	[key: string]: any;
};

export const objectToFormData = (data: DataType) => {
	return new URLSearchParams(data).toString();
};
