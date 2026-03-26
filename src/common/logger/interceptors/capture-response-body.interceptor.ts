import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	NestInterceptor
} from '@nestjs/common';

@Injectable()
export class CaptureResponseBodyInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const response = context.switchToHttp().getResponse();

		return next.handle().pipe(
			tap(data => {
				response.body = data;
			}),
			catchError((error: unknown) => {
				if (error instanceof HttpException) {
					response.body = error.getResponse();
				}

				return throwError(() => error);
			})
		);
	}
}
