import { DocumentBuilder } from '@nestjs/swagger';

export const swaggerConfig = new DocumentBuilder()
	.setTitle('Stud Progress API')
	.setVersion('1.0')
	.build();
