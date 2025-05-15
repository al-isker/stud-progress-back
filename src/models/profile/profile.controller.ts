import { Body, Controller, Get, Patch, UsePipes, ValidationPipe } from '@nestjs/common';
import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorators/student.decorator';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @Auth()
  async get(@CurrentStudent() studentId: number) {
    return await this.profileService.getByStudentId(studentId)
  }

  @Patch('update-semester')
  @Auth()
  @UsePipes(new ValidationPipe())
  async updateSemester(
    @CurrentStudent() studentId: number,
    @Body() dto: UpdateSemesterDto
  ) {
    return await this.profileService.updateSemester(studentId, dto)
  }
}
