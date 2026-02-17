import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DgmuModule } from '../dgmu/dgmu.module';
import { GradeHelperModule } from '../grade-helper/grade-helper.module';
import { RatingBySemesterHelperModule } from '../rating-by-semester-helper/rating-by-semester-helper.module';
import { PasswordService } from './password.service';
import { StudentService } from './student.service';

@Module({
	imports: [GradeHelperModule, RatingBySemesterHelperModule, DgmuModule],
	providers: [StudentService, PrismaService, ConfigService, PasswordService],
	exports: [StudentService]
})
export class StudentModule {}
