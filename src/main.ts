import { Logger } from 'nestjs-pino';
import { readFileSync, writeFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT_KEY } from './common/lib/env/env-keys';
import { buildSwagger } from './common/swagger/build-swagger';
import {
	ParseStatus,
	QuestionRejectionReason,
	parseTestDocument
} from './lib/test-document-parser';

async function bootstrap() {
	const result = await parseTestDocument({
		// data: readFileSync('./src/lib/test-document-parser/fixtures/short/valid/001/document.pdf'),
		data: readFileSync('./src/lib/test-document-parser/fixtures/valid/001/document.pdf'),
		filename: 'bootstrap-test'
	});

	writeFileSync('./parse-result.json', JSON.stringify(result, null, 2));

	console.log(result.status);
	if (result.status === ParseStatus.ACCEPTED) {
		const { rejectedQuestions } = result.issues;
		const rejectionCounts = Object.fromEntries(
			Object.values(QuestionRejectionReason).map(reason => [
				reason,
				rejectedQuestions.filter(question => question.reason === reason).length
			])
		);

		console.log('questions', result.document.questions.length);
		console.log('questionRejectionReasons', rejectionCounts);
	} else {
		console.log(result.reason);
	}

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
