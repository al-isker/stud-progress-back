import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { RequestWithUser } from 'src/models/auth/types/request-with-user.type';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

@Injectable()
export class AssignStudentIdInterceptor implements NestInterceptor {
	constructor(private readonly pinoLogger: PinoLogger) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const request = context.switchToHttp().getRequest<RequestWithUser>();

		const studentId = request.user?.id;

		if (studentId !== undefined) {
			this.pinoLogger.assign({ studentId });
		}

		return next.handle();
	}
}
