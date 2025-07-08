import { IsString } from 'class-validator';

export class DeviceInfoUpsertDto {
	@IsString()
	fcmToken: string;
}
