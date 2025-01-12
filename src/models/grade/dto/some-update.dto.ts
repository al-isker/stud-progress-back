import { ControlType, GradeStatus } from '@prisma/client';

class SomeUpdateDtoItem {
	name: string;
	controlType: ControlType;
	date: Date;
	status: GradeStatus;
	mark: number;
}

export type SomeUpdateDto = SomeUpdateDtoItem[];
