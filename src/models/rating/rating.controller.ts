import { Controller, Get, Param, Patch } from '@nestjs/common';
import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorator/student.decorator';
import { RatingService } from './rating.service';

@Controller('rating')
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Get()
  @Auth()
  getAll(@CurrentStudent('id') studentId: number) {
    return this.ratingService.getAll(studentId)
  }

  @Patch('view/:id')
  @Auth()
  view(@Param('id') id: string) {
    return this.ratingService.view(+id)
  }
}
