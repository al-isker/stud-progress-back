import { Module } from '@nestjs/common';
import { StudentModule } from 'src/models/student/student.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [StudentModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
