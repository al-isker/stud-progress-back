import { Controller, Get } from '@nestjs/common';
import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorator/student.decorator';
import { SubjectService } from './subject.service';

@Controller('subject')
export class SubjectController {
  constructor(private readonly subjectService: SubjectService) {}

  @Get()
  @Auth()
  async test(@CurrentStudent('id') studentId: number) {
    return this.subjectService.test(studentId)
  }
}
