import { ExternalPortalSubjectListWithGrade } from './external-portal-subject-list-with-grade.type';

export interface ExternalPortalSubjectListWithGradeBySemester {
	semester: number;
	subjectList: ExternalPortalSubjectListWithGrade;
}

export type ExternalPortalSubjectListWithGradeByAllSemesters =
	ExternalPortalSubjectListWithGradeBySemester[];
