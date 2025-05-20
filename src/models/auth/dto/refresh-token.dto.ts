import { IsString, IsUUID } from 'class-validator';

export class RefreshTokenDto {
	@IsString()
	@IsUUID()
	refreshToken: string;
}
