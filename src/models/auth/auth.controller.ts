import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentStudentId } from '../student/decorators/current-student-id.decorator';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	login(@Body() dto: LoginDto) {
		return this.authService.login(dto);
	}

	@Post('refresh-token')
	@HttpCode(HttpStatus.OK)
	refreshToken(@Body() dto: RefreshTokenDto) {
		return this.authService.refreshToken(dto);
	}

	@Post('logout')
	@HttpCode(HttpStatus.OK)
	@Auth()
	logout(@CurrentStudentId() studentId: number) {
		return this.authService.logout(studentId);
	}
}
