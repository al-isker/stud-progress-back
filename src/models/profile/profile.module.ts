import { Module } from '@nestjs/common';
import { StudentModule } from 'src/models/student/student.module';
import { RatingModule } from '../rating/rating.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [StudentModule, RatingModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
