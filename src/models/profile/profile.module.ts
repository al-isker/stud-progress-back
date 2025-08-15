import { StudentModule } from 'src/models/student/student.module';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
	imports: [StudentModule],
	controllers: [ProfileController],
	providers: [ProfileService, PrismaService]
})
export class ProfileModule {}
