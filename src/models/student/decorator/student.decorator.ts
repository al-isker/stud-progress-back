import { Student } from '@prisma/client';

import { ExecutionContext, createParamDecorator } from '@nestjs/common';

export const CurrentStudent = createParamDecorator(
	(key: keyof Student, ctx: ExecutionContext) => {
		const request = ctx.switchToHttp().getRequest();
		const student = request.user;

		return key ? student[key] : student;
	}
);
