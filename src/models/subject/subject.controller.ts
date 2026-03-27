import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudentId } from '../student/decorators/current-student-id.decorator';
import { SubjectService } from './subject.service';

@Controller('subject')
export class SubjectController {
	constructor(private readonly subjectService: SubjectService) {}

	@Get('grade')
	@Auth()
	getAllWithGrade(@CurrentStudentId() studentId: number) {
		return this.subjectService.getAllWithGrade(studentId);
	}

	@Get('rating')
	@Auth()
	getAllWithRating(@CurrentStudentId() studentId: number) {
		return this.subjectService.getAllWithRating(studentId);
	}

	@Get(':id/rating')
	@Auth()
	getByIdWithRating(
		@CurrentStudentId() studentId: number,
		@Param('id', ParseIntPipe) subjectId: number
	) {
		return this.subjectService.getByIdWithRating(studentId, subjectId);
	}
}
