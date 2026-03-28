import { IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
	@IsString()
	@IsUUID(7)
	refreshToken: string;
}
