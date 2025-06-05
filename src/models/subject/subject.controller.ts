import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
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
	viewGradeBySubjectId(@Param('id', ParseIntPipe) id: number) {
		return this.subjectService.viewGradeBySubjectId(id);
	}

	@Patch(':id/view-events')
	@Auth()
	viewEventsBySubjectId(@Param('id', ParseIntPipe) id: number) {
		return this.subjectService.viewEventsBySubjectId(id);
	}
}
