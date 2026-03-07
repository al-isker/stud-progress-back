import { Injectable } from '@nestjs/common';
import { ExternalPortalRouterService } from './external-portal-router.service';
import { ExternalPortalEventsPageParser } from './parsers/external-portal-events-page.parser';
import { ExternalPortalGradePageParser } from './parsers/external-portal-grade-page.parser';
import {
	ExternalPortalProgress,
	ExternalPortalProgressInclude
} from './types/external-portal-progress.type';
import { ExternalPortalStudentData } from './types/external-portal-student-data.type';

@Injectable()
export class ExternalPortalService {
	constructor(
		private externalPortalRouterService: ExternalPortalRouterService,
		private externalPortalGradePageParser: ExternalPortalGradePageParser,
		private externalPortalEventsPageParser: ExternalPortalEventsPageParser
	) {}

	async validate(data: ExternalPortalStudentData) {
		await this.externalPortalRouterService.getSessid(data);
	}

	async getProgress<TInclude extends ExternalPortalProgressInclude>(
		data: ExternalPortalStudentData,
		include: TInclude
	) {
		const sessid = await this.externalPortalRouterService.getSessid(data);

		const gradePagePromise =
			include?.subjectListWithGrade || include?.subjectListWithGradeByAllSemesters
				? this.externalPortalRouterService.getGradePage(sessid)
				: Promise.resolve(null);

		const eventsPagePromise = include?.subjectListWithEventList
			? this.externalPortalRouterService.getEventsPage(sessid, data.semester)
			: Promise.resolve(null);

		const [gradePage, eventsPage] = await Promise.all([gradePagePromise, eventsPagePromise]);

		const result: Record<string, unknown> = {};

		if (include?.subjectListWithGrade && gradePage) {
			result.subjectListWithGrade = this.externalPortalGradePageParser.parseBySemester(
				gradePage,
				data.semester
			);
		}

		if (include?.subjectListWithGradeByAllSemesters && gradePage) {
			result.subjectListWithGradeByAllSemesters =
				this.externalPortalGradePageParser.parseAllSemesters(gradePage);
		}

		if (include?.subjectListWithEventList && eventsPage) {
			result.subjectListWithEventList = this.externalPortalEventsPageParser.parse(eventsPage);
		}

		return result as ExternalPortalProgress<TInclude>;
	}
}
