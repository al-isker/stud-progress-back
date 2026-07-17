import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LOG_FILE_PATH_KEY } from '../lib/env/env-keys';
import { AssignStudentIdInterceptor } from './interceptors/assign-student-id.interceptor';
import { CaptureResponseBodyInterceptor } from './interceptors/capture-response-body.interceptor';

@Module({
	imports: [
		PinoLoggerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const logFilePath = configService.get<string>(LOG_FILE_PATH_KEY);

				return {
					assignResponse: true,
					pinoHttp: {
						autoLogging: true,
						transport: {
							target: 'pino/file',
							options: {
								destination: logFilePath,
								mkdir: true
							}
						},
						wrapSerializers: false,
						serializers: {
							req: request => ({
								method: request.method,
								url: request.url,
								body: request.body
							}),
							res: response => ({
								statusCode: response.statusCode,
								body: response.body
							})
						},
						redact: {
							paths: ['req.body.refreshToken', 'res.body.accessToken', 'res.body.refreshToken'],
							censor: '[REDACTED]'
						}
					}
				};
			}
		})
	],
	providers: [
		{
			provide: APP_INTERCEPTOR,
			useClass: CaptureResponseBodyInterceptor
		},
		{
			provide: APP_INTERCEPTOR,
			useClass: AssignStudentIdInterceptor
		}
	],
	exports: [PinoLoggerModule]
})
export class LoggerModule {}
