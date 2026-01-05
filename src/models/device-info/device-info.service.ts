import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateExpoPushTokenDto } from './dto/update-expo-push-token.dto';

@Injectable()
export class DeviceInfoService {
	constructor(private prisma: PrismaService) {}

	async updateExpoPushToken(studentId: number, dto: UpdateExpoPushTokenDto) {
		await this.prisma.student.update({
			where: {
				id: studentId
			},
			data: {
				expoPushToken: dto.expoPushToken
			}
		});
	}
}
