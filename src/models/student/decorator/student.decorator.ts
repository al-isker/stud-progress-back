import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const CurrentStudent = createParamDecorator(
	(_, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		const student = request.user;

		return student.id;
	}
);
