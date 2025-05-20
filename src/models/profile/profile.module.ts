import { StudentModule } from 'src/models/student/student.module';
import { Module } from '@nestjs/common';
import { SubjectUpdaterModule } from '../subject-helper/subject-helper.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
	imports: [StudentModule, SubjectUpdaterModule],
	controllers: [ProfileController],
	providers: [ProfileService]
})
export class ProfileModule {}
