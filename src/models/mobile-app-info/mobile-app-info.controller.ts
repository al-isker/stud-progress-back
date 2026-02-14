import { Controller, Get } from '@nestjs/common';
import { MobileAppInfoService } from './mobile-app-info.service';

@Controller('mobile-app-info')
export class MobileAppInfoController {
	constructor(private readonly mobileAppInfoService: MobileAppInfoService) {}

	@Get()
	get() {
		return this.mobileAppInfoService.get();
	}
}
