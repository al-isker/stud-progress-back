import { Logger } from 'nestjs-pino';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT_KEY } from './common/lib/env/env-keys';
import { buildSwagger } from './common/swagger/build-swagger';

async function bootstrap() {
	const PORT = process.env[PORT_KEY] ?? 4200;

	const app = await NestFactory.create(AppModule);

	buildSwagger(app);

	app.useLogger(app.get(Logger));

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true
		})
	);

	await app.listen(PORT);
}
bootstrap();
