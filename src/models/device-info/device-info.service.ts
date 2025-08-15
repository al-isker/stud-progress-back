import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

@Injectable()
export class DeviceInfoService {
	constructor(private prisma: PrismaService) {}

	async updateFcmToken(studentId: number, dto: UpdateFcmTokenDto) {
		return await this.prisma.student.update({
			where: {
				id: studentId
			},
			data: {
				fcmToken: dto.fcmToken
			}
		});
	}
}
