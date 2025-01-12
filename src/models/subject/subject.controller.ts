import { Controller, Get, Param, Patch } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorator/student.decorator';
import { SubjectService } from './subject.service';

@Controller('subject')
export class SubjectController {
  constructor(private readonly subjectService: SubjectService) {}

  @Get()
  @Auth()
  getAll(@CurrentStudent() studentId: number) {
    return this.subjectService.getAll(studentId)
  }

  @Get('grade')
  @Auth()
  getGradeAll(@CurrentStudent() studentId: number) {
    return this.subjectService.getGradeAll(studentId)
  }

  @Get('rating')
  @Auth()
  getRatingAll(@CurrentStudent() studentId: number) {
    return this.subjectService.getRatingAll(studentId)
  }

  @Patch('grade/view/:id')
  @Auth()
  viewGradeById(@Param('id') id: string) {
    return this.subjectService.viewGradeById(+id)
  }

  @Patch('rating/view/:id')
  @Auth()
  viewRatingById(@Param('id') id: string) {
    return this.subjectService.viewRatingById(+id)
  }
}
