import { Controller, Get } from '@nestjs/common';
import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorator/student.decorator';
import { RatingService } from './rating.service';

@Controller('rating')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Get()
  @Auth()
  async getAll(@CurrentStudent('id') studentId: number) {
    return this.ratingService.getAll(studentId)
  }
}
