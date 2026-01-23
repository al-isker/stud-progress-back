import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MobileAppInfoController } from './mobile-app-info.controller';
import { MobileAppInfoService } from './mobile-app-info.service';

@Module({
	controllers: [MobileAppInfoController],
	providers: [MobileAppInfoService, ConfigService]
})
export class MobileAppInfoModule {}
