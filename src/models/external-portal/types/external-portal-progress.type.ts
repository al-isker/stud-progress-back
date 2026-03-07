import { ExternalPortalSubjectListWithEventList } from './external-portal-subject-list-with-event-list.type';
import { ExternalPortalSubjectListWithGradeByAllSemesters } from './external-portal-subject-list-with-grade-by-all-semesters.type';
import { ExternalPortalSubjectListWithGrade } from './external-portal-subject-list-with-grade.type';

type ExternalPortalProgressFull = {
	subjectListWithGrade: ExternalPortalSubjectListWithGrade;
	subjectListWithGradeByAllSemesters: ExternalPortalSubjectListWithGradeByAllSemesters;
	subjectListWithEventList: ExternalPortalSubjectListWithEventList;
};

export type ExternalPortalProgressInclude = Partial<
	Record<keyof ExternalPortalProgressFull, boolean>
>;

export type ExternalPortalProgress<T extends ExternalPortalProgressInclude> = {
	[K in keyof ExternalPortalProgressFull as T[K] extends true
		? K
		: never]: ExternalPortalProgressFull[K];
};
