import { IsString } from 'class-validator';

export class UpdateExpoPushTokenDto {
	@IsString()
	expoPushToken: string;
}
