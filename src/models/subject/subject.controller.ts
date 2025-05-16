import { Controller, Get, Param, Patch } from '@nestjs/common';

import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { SubjectService } from './subject.service';

@Controller('subject')
export class SubjectController {
	constructor(private readonly subjectService: SubjectService) {}

	@Get()
	@Auth()
	getAll(@CurrentStudent() studentId: number) {
		return this.subjectService.getAll(studentId);
	}

	@Get('grade')
	@Auth()
	getAllWithGrade(@CurrentStudent() studentId: number) {
		return this.subjectService.getAllWithGrade(studentId);
	}

	@Get('grade/count-news')
	@Auth()
	getCountGradeNews(@CurrentStudent() studentId: number) {
		return this.subjectService.getCountGradeNews(studentId);
	}

	@Get('rating')
	@Auth()
	getAllWithRating(@CurrentStudent() studentId: number) {
		return this.subjectService.getAllWithRating(studentId);
	}

	@Get('rating/count-news')
	@Auth()
	getCountRatingNews(@CurrentStudent() studentId: number) {
		return this.subjectService.getCountRatingNews(studentId);
	}

	@Patch(':id/view-grade')
	@Auth()
	viewGradeBySubjectId(@Param('id') id: string) {
		return this.subjectService.viewGradeBySubjectId(+id);
	}

	@Patch(':id/view-events')
	@Auth()
	viewEventsBySubjectId(@Param('id') id: string) {
		return this.subjectService.viewEventsBySubjectId(+id);
	}
}
