import { RatingStatus } from '@prisma/client';

export class RatingDtoItem {
	date: Date;
	status: RatingStatus;
	mark: number;
}

export class SubjectsWithRatingDtoItem {
	name: string;
	rating: RatingDtoItem[];
}

export type SubjectsWithRatingDto = SubjectsWithRatingDtoItem[];
