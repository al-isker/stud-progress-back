import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MobileAppInfoController } from './mobile-app-info.controller';
import { MobileAppInfoService } from './mobile-app-info.service';

@Module({
	imports: [ConfigModule],
	controllers: [MobileAppInfoController],
	providers: [MobileAppInfoService]
})
export class MobileAppInfoModule {}
