import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { getStudentIdFromRequest } from 'src/models/student/utils/get-student-id-from-request';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';

@Injectable()
export class AssignStudentIdInterceptor implements NestInterceptor {
	constructor(private readonly pinoLogger: PinoLogger) {}

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const request = context.switchToHttp().getRequest();

		const studentId = getStudentIdFromRequest(request);

		if (studentId !== null) {
			this.pinoLogger.assign({ studentId });
		}

		return next.handle();
	}
}
