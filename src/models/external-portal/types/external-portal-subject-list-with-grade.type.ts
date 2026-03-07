import { ControlType, GradeStatus } from '@prisma/client';

export interface ExternalPortalSubjectWithGrade {
	name: string;
	controlType: ControlType;
	date: Date;
	status: GradeStatus;
	mark: number;
}

export type ExternalPortalSubjectListWithGrade =
	ExternalPortalSubjectWithGrade[];
