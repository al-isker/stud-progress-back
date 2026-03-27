import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudentId } from '../student/decorators/current-student-id.decorator';
import { GradeService } from './grade.service';

@Controller('grade')
export class GradeController {
	constructor(private readonly gradeService: GradeService) {}

	@Get('count-news')
	@Auth()
	getCountNews(@CurrentStudentId() studentId: number) {
		return this.gradeService.getCountNews(studentId);
	}
}
