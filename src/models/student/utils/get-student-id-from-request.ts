type Request = {
	user?: {
		id?: number;
	};
};

export const getStudentIdFromRequest = (request: Request) => {
	const student = request.user;

	return student?.id ?? null;
};
