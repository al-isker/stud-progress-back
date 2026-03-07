import { Auth } from 'src/models/auth/decorators/auth.decorator';
import { CurrentStudent } from 'src/models/student/decorators/student.decorator';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	@Get()
	@Auth()
	getByStudentId(@CurrentStudent() studentId: number) {
		return this.profileService.getByStudentId(studentId);
	}

	@Patch('semester')
	@Auth()
	updateSemester(@CurrentStudent() studentId: number, @Body() dto: UpdateSemesterDto) {
		return this.profileService.updateSemester(studentId, dto);
	}
}
