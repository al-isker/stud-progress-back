import { RequestWithUser } from 'src/models/auth/types/request-with-user.type';
import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const CurrentStudentId = createParamDecorator((_, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest<RequestWithUser>();

	return request.user!.id;
});
