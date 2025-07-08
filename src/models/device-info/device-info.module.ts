import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceInfoController } from './device-info.controller';
import { DeviceInfoService } from './device-info.service';

@Module({
	controllers: [DeviceInfoController],
	providers: [DeviceInfoService, PrismaService]
})
export class DeviceInfoModule {}
