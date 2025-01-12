import { RatingStatus } from '@prisma/client';

class SomeUpdateDtoItem {
	name: string;
	rating: {
		date: Date;
		status: RatingStatus;
		mark: number;
	}[];
}

export type SomeUpdateDto = SomeUpdateDtoItem[];
