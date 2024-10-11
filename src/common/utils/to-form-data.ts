type DataType = {
	[key: string]: any;
};

export const toFormData = (data: DataType) => {
	return new URLSearchParams(data).toString();
};
