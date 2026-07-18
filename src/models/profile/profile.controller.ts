import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Auth } from '@/models/auth/decorators/auth.decorator';
import { CurrentStudentId } from '@/models/student/decorators/current-student-id.decorator';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
	constructor(private readonly profileService: ProfileService) {}

	@Get()
	@Auth()
	getByStudentId(@CurrentStudentId() studentId: number) {
		return this.profileService.getByStudentId(studentId);
	}

	@Patch('semester')
	@Auth()
	updateSemester(@CurrentStudentId() studentId: number, @Body() dto: UpdateSemesterDto) {
		return this.profileService.updateSemester(studentId, dto);
	}
}
