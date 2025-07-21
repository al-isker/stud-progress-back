import { Body, Controller, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { DeviceInfoService } from './device-info.service';
import { DeviceInfoUpsertDto } from './dto/device-info-upsert.dto';

@Controller('device-info')
export class DeviceInfoController {
	constructor(private readonly deviceInfoService: DeviceInfoService) {}

	@Post()
	@Auth()
	upsert(
		@CurrentStudent() studentId: number,
		@Body() dto: DeviceInfoUpsertDto
	) {
		return this.deviceInfoService.upsert(studentId, dto);
	}
}
