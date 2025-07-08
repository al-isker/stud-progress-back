import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceInfoUpsertDto } from './dto/device-info-upsert.dto';

@Injectable()
export class DeviceInfoService {
	constructor(private prisma: PrismaService) {}

	async upsert(studentId: number, dto: DeviceInfoUpsertDto) {
		return await this.prisma.deviceInfo.upsert({
			where: {
				studentId
			},
			create: {
				studentId,
				fcmToken: dto.fcmToken
			},
			update: {
				fcmToken: dto.fcmToken
			}
		});
	}
}
