import { IsNumber } from 'class-validator';

export class UpdateSemesterDto {
	@IsNumber()
	semester: number;
}
