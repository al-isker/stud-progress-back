import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const buildSwagger = (app: INestApplication) => {
	const documentConfig = new DocumentBuilder()
		.setTitle('Stud Progress API')
		.setVersion('1.0')
		.build();

	const document = SwaggerModule.createDocument(app, documentConfig);

	SwaggerModule.setup('api', app, document);
};
