import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { RequestWithUser } from '@/models/auth/types/request-with-user.type';

export const CurrentStudentId = createParamDecorator((_, ctx: ExecutionContext) => {
	const request = ctx.switchToHttp().getRequest<RequestWithUser>();

	return request.user!.id;
});
