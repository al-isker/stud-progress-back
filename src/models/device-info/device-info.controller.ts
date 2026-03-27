import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudentId } from '../student/decorators/current-student-id.decorator';
import { DeviceInfoService } from './device-info.service';
import { UpdateExpoPushTokenDto } from './dto/update-expo-push-token.dto';

@Controller('device-info')
export class DeviceInfoController {
	constructor(private readonly deviceInfoService: DeviceInfoService) {}

	@Post('expo-push-token')
	@Auth()
	updateExpoPushToken(@CurrentStudentId() studentId: number, @Body() dto: UpdateExpoPushTokenDto) {
		return this.deviceInfoService.updateExpoPushToken(studentId, dto);
	}
}
