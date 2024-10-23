import { Body, Controller, Get, Patch, UsePipes, ValidationPipe } from '@nestjs/common';
import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorator/student.decorator';
import { UpdateSemesterDto } from './dto/update-semester';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @Auth()
  async getData(@CurrentStudent() id: number) {
    return await this.profileService.getData(id)
  }

  @Patch('update-semester')
  @Auth()
  @UsePipes(new ValidationPipe())
  async updateSemester(
    @CurrentStudent() id: number,
    @Body() dto: UpdateSemesterDto
  ) {
    return await this.profileService.updateSemester(id, dto)
  }
}
