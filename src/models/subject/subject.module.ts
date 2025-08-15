import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';

@Module({
	controllers: [SubjectController],
	providers: [SubjectService, PrismaService]
})
export class SubjectModule {}
