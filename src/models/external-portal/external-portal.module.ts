import { Module } from '@nestjs/common';
import { ExternalPortalRouterService } from './external-portal-router.service';
import { ExternalPortalService } from './external-portal.service';
import { ExternalPortalEventsPageParser } from './parsers/external-portal-events-page.parser';
import { ExternalPortalGradePageParser } from './parsers/external-portal-grade-page.parser';

@Module({
	providers: [
		ExternalPortalService,
		ExternalPortalRouterService,
		ExternalPortalGradePageParser,
		ExternalPortalEventsPageParser
	],
	exports: [ExternalPortalService]
})
export class ExternalPortalModule {}
