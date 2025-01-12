import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { GradeModule } from '../grade/grade.module';
import { RatingModule } from '../rating/rating.module';
import { StudentModule } from '../student/student.module';
import { SubjectUpdaterService } from './subject-updater.service';

@Module({
  imports: [StudentModule, GradeModule, RatingModule, DgmuModule],
  providers: [SubjectUpdaterService],
  exports: [SubjectUpdaterService]
})
export class SubjectUpdaterModule {}
