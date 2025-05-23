type OmitFn = <O, K extends keyof O>(obj: O, ...keys: K[]) => Omit<O, K>;

export const omit: OmitFn = (obj, ...keys) => {
	const cloneObj = { ...obj };

	for (const key of keys) {
		delete cloneObj[key];
	}

	return cloneObj;
};
