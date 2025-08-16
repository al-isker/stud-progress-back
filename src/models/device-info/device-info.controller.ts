import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { DeviceInfoService } from './device-info.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

@Controller('device-info')
export class DeviceInfoController {
	constructor(private readonly deviceInfoService: DeviceInfoService) {}

	@Post('fcm-token')
	@Auth()
	updateFcmToken(
		@CurrentStudent() studentId: number,
		@Body() dto: UpdateFcmTokenDto
	) {
		return this.deviceInfoService.updateFcmToken(studentId, dto);
	}
}
