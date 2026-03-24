import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { swaggerConfig } from './common/config/swagger/swagger-config';
import { PORT_KEY } from './common/lib/env/env-keys';

async function bootstrap() {
	const PORT = process.env[PORT_KEY] ?? 4200;
	const app = await NestFactory.create(AppModule);

	const document = SwaggerModule.createDocument(app, swaggerConfig);
	SwaggerModule.setup('api', app, document);

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true
		})
	);

	await app.listen(PORT, () => {
		console.log(`Server started on port ${PORT}`);
	});
}
bootstrap();
