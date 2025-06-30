import { Module } from '@nestjs/common';
import { DgmuModule } from '../dgmu/dgmu.module';
import { GradeHelperModule } from '../grade-helper/grade-helper.module';
import { RatingBySemesterHelperModule } from '../rating-by-semester-helper/rating-by-semester-helper.module';
import { SubjectHelperService } from './subject-helper.service';

@Module({
	imports: [GradeHelperModule, RatingBySemesterHelperModule, DgmuModule],
	providers: [SubjectHelperService],
	exports: [SubjectHelperService]
})
export class SubjectHelperModule {}
