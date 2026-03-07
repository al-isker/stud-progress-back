import { Module } from '@nestjs/common';
import { ExternalPortalEventsPageParser } from './parsers/external-portal-events-page.parser';
import { ExternalPortalGradePageParser } from './parsers/external-portal-grade-page.parser';
import { ExternalPortalRouterService } from './external-portal-router.service';
import { ExternalPortalService } from './external-portal.service';

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
