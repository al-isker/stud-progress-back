import { Module } from '@nestjs/common';
import { AntiCaptchaService } from './anti-captcha.service';

@Module({
	providers: [AntiCaptchaService],
	exports: [AntiCaptchaService]
})
export class AntiCaptchaModule {}
