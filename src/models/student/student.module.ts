import { PrismaService } from 'src/prisma.service';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';
import { StudentService } from './student.service';

@Module({
	providers: [StudentService, PrismaService, ConfigService, PasswordService],
	exports: [StudentService]
})
export class StudentModule {}
