import { Injectable, UnauthorizedException } from '@nestjs/common';
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

	private async getProgressBySessionId<TInclude extends ExternalPortalProgressInclude>(
		data: Pick<ExternalPortalStudentData, 'semester'> & { cookie: string },
		include: TInclude
	) {
		const { semester, cookie } = data;

		const gradePagePromise =
			include?.subjectListWithGrade || include?.subjectListWithGradeByAllSemesters
				? this.externalPortalRouterService.getGradePage(cookie)
				: Promise.resolve(null);

		const eventsPagePromise = include?.subjectListWithEventList
			? this.externalPortalRouterService.getEventsPage(cookie, semester)
			: Promise.resolve(null);

		const [gradePage, eventsPage] = await Promise.all([gradePagePromise, eventsPagePromise]);

		const result: Record<string, unknown> = {};

		if (include?.subjectListWithGrade && gradePage) {
			result.subjectListWithGrade = this.externalPortalGradePageParser.parseBySemester(
				gradePage,
				semester
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

	async getProgress<TInclude extends ExternalPortalProgressInclude>(
		data: ExternalPortalStudentData & { cookie?: string },
		include: TInclude
	) {
		const { fullName, password, semester, cookie } = data;

		if (cookie) {
			try {
				const progress = await this.getProgressBySessionId({ semester, cookie }, include);

				return Object.assign(progress, { cookie });
			} catch (error) {
				const isUnauthorized = error instanceof UnauthorizedException;

				if (!isUnauthorized) {
					throw error;
				}
			}
		}

		const newCookie = await this.externalPortalRouterService.getAuthorizedCookie({
			fullName,
			password
		});

		const progress = await this.getProgressBySessionId({ semester, cookie: newCookie }, include);

		return Object.assign(progress, { cookie: newCookie });
	}
}
