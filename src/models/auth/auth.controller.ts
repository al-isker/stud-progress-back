import { Body, Controller, Post, Req, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UsePipes(new ValidationPipe())
  async login(
    @Res({passthrough: true}) res: Response, 
    @Body() dto: LoginDto
  ) {
    return this.authService.login(res, dto) 
  }

  @Post('refresh-token')
  @UsePipes(new ValidationPipe())
  async refreshToken(
    @Req() req: Request,
    @Res({passthrough: true}) res: Response
  ) {
    return this.authService.refreshToken(req, res)
  }

  @Post('logout')
  async logout(
    @Res({passthrough: true}) res: Response
  ) {
    return this.authService.logout(res)
  }
}
