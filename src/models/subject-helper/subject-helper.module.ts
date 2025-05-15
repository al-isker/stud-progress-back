import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { GradeModule } from '../grade/grade.module';
import { RatingBySemesterModule } from '../rating-by-semester/rating-by-semester.module';
import { StudentModule } from '../student/student.module';
import { SubjectHelperService } from './subject-helper.service';

@Module({
  imports: [StudentModule, GradeModule, RatingBySemesterModule, DgmuModule],
  providers: [SubjectHelperService],
  exports: [SubjectHelperService]
})
export class SubjectUpdaterModule {}
