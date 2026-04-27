import { IsString, IsUUID } from 'class-validator';

export class RefreshAccessTokenDto {
	@IsString()
	@IsUUID(7)
	refreshToken: string;
}
