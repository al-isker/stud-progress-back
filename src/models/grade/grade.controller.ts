import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { GradeService } from './grade.service';

@Controller('grade')
export class GradeController {
	constructor(private readonly gradeService: GradeService) {}

	@Get('count-news')
	@Auth()
	getCountNews(@CurrentStudent() studentId: number) {
		return this.gradeService.getCountNews(studentId);
	}

	@Patch(':id/view')
	@Auth()
	viewById(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) gradeId: number
	) {
		return this.gradeService.viewById(studentId, gradeId);
	}
}
