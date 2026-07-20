import { Logger } from 'nestjs-pino';
import { readFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT_KEY } from './common/lib/env/env-keys';
import { buildSwagger } from './common/swagger/build-swagger';
import { parseTestDocument } from './lib/test-document-parser';

async function bootstrap() {
	const result = await parseTestDocument({
		data: readFileSync('C:/Users/balis/OneDrive/Desktop/fixtures/valid/001/document.pdf'),
		filename: 'bootstrap-test'
	});

	console.log(result);

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
