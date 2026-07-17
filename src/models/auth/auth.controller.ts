import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentStudentId } from '../student/decorators/current-student-id.decorator';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { RefreshAccessTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('refresh-access-token')
	@HttpCode(HttpStatus.OK)
	refreshAccessToken(@Body() dto: RefreshAccessTokenDto) {
		return this.authService.refreshAccessToken(dto);
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@Auth()
	logout(@CurrentStudentId() studentId: number) {
		return this.authService.logout(studentId);
	}
}
