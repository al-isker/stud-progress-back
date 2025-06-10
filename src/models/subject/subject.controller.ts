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

	@Get(':id/rating')
	@Auth()
	getById(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) subjectId: string
	) {
		return this.subjectService.getByIdWithRating(studentId, +subjectId);
	}

	@Get('rating/count-news')
	@Auth()
	getCountRatingNews(@CurrentStudent() studentId: number) {
		return this.subjectService.getCountRatingNews(studentId);
	}

	@Patch(':id/view-grade')
	@Auth()
	viewGradeBySubjectId(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) subjectId: number
	) {
		return this.subjectService.viewGradeBySubjectId(studentId, subjectId);
	}

	@Patch(':id/view-events')
	@Auth()
	viewEventsBySubjectId(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) subjectId: number
	) {
		return this.subjectService.viewEventsBySubjectId(studentId, subjectId);
	}
}
