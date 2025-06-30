import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { StudentModule } from '../student/student.module';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';

@Module({
	imports: [StudentModule],
	controllers: [GradeController],
	providers: [GradeService, PrismaService]
})
export class GradeModule {}
