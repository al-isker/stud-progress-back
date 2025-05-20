import { PrismaService } from 'src/prisma.service';
import { Module } from '@nestjs/common';
import { StudentModule } from '../student/student.module';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';

@Module({
	imports: [StudentModule],
	controllers: [SubjectController],
	providers: [SubjectService, PrismaService]
})
export class SubjectModule {}
