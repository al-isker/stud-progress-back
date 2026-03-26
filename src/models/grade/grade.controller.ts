import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/current-student.decorator';
import { GradeService } from './grade.service';

@Controller('grade')
export class GradeController {
	constructor(private readonly gradeService: GradeService) {}

	@Get('count-news')
	@Auth()
	getCountNews(@CurrentStudent() studentId: number) {
		return this.gradeService.getCountNews(studentId);
	}
}
