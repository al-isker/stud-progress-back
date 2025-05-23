import { PrismaService } from 'src/models/prisma/prisma.service';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubjectHelperModule } from '../subject-helper/subject-helper.module';
import { PasswordService } from './password.service';
import { StudentService } from './student.service';

@Module({
	imports: [SubjectHelperModule],
	providers: [StudentService, PrismaService, ConfigService, PasswordService],
	exports: [StudentService]
})
export class StudentModule {}
