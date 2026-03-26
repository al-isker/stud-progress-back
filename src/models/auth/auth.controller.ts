import { Body, Controller, Post } from '@nestjs/common';
import { CurrentStudent } from '../student/decorators/current-student.decorator';
import { AuthService } from './auth.service';
import { Auth } from './decorators/auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post('login')
	login(@Body() dto: LoginDto) {
		return this.authService.login(dto);
	}

	@Post('refresh-token')
	refreshToken(@Body() dto: RefreshTokenDto) {
		return this.authService.refreshToken(dto);
	}

	@Post('logout')
	@Auth()
	logout(@CurrentStudent() studentId: number) {
		return this.authService.logout(studentId);
	}
}
