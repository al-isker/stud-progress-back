import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { StudentModule } from '../student/student.module';
import { GradeService } from './grade.service';

@Module({
	imports: [StudentModule, DgmuModule],
	providers: [GradeService, PrismaService],
	exports: [GradeService]
})
export class GradeModule {}
