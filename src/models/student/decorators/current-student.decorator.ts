import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { getStudentIdFromRequest } from '../utils/get-student-id-from-request';

export const CurrentStudent = createParamDecorator((_, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest();

	return getStudentIdFromRequest(request);
});
