import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { SubjectService } from './subject.service';

@Controller('subject')
export class SubjectController {
	constructor(private readonly subjectService: SubjectService) {}

	@Get('grade')
	@Auth()
	getAllWithGrade(@CurrentStudent() studentId: number) {
		return this.subjectService.getAllWithGrade(studentId);
	}

	@Get('rating')
	@Auth()
	getAllWithRating(@CurrentStudent() studentId: number) {
		return this.subjectService.getAllWithRating(studentId);
	}

	@Get(':id/rating')
	@Auth()
	getByIdWithRating(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) subjectId: string
	) {
		return this.subjectService.getByIdWithRating(studentId, +subjectId);
	}
}
