import { EventStatus } from '@prisma/client';
import * as cheerio from 'cheerio';
import { isExist } from 'src/common/lib/light-lodash/is-exist';
import { Injectable } from '@nestjs/common';
import {
	ExternalPortalEvent,
	ExternalPortalSubjectListWithEventList
} from '../types/external-portal-subject-list-with-event-list.type';
import { ruDateToJSDate } from '../utils/ru-date-to-js-date';

@Injectable()
export class ExternalPortalEventsPageParser {
	parse(page: string): ExternalPortalSubjectListWithEventList {
		const $ = cheerio.load(page);

		return $('#journal_tag .mobileView .accordion-item')
			.map((_, subjectEl) => {
				const h2 = $(subjectEl).find('h2').text();
				const name = h2.slice(0, h2.indexOf('(') - 1);

				const eventList = $(subjectEl)
					.find('tbody tr')
					.get()
					.map(item => {
						const event: Partial<ExternalPortalEvent> = {};

						const [dateEl, markEl] = $(item).find('td').get();
						const dateStr = $(dateEl).text().trim();
						const markStr = $(markEl).text().trim();
						const markClass = $(markEl).attr('class').trim();

						event.date = isExist(dateStr) ? ruDateToJSDate(dateStr) : null;

						if (markClass === 'propusk') {
							event.status = EventStatus.ABSENCE;
							event.mark = null;
						} else if (markClass === 'upworked') {
							event.status = EventStatus.UPWORKED;
							event.mark = null;
						} else {
							const mark = Number(markStr);

							if (markStr.length > 0 && !isNaN(mark)) {
								event.status = EventStatus.MARK;
								event.mark = mark;
							} else {
								event.status = EventStatus.EMPTY;
								event.mark = null;
							}
						}

						return event as ExternalPortalEvent;
					});

				return { name, eventList };
			})
			.get();
	}
}
