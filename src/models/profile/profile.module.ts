import { Module } from '@nestjs/common';
import { StudentModule } from 'src/models/student/student.module';
import { SubjectUpdaterModule } from '../subject-updater/subject-updater.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [StudentModule, SubjectUpdaterModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
