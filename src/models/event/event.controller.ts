import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/student.decorator';
import { EventService } from './event.service';

@Controller('event')
export class EventController {
	constructor(private readonly eventService: EventService) {}

	@Get('count-news')
	@Auth()
	getCountNews(@CurrentStudent() studentId: number) {
		return this.eventService.getCountNews(studentId);
	}

	@Patch(':id/view')
	@Auth()
	viewById(
		@CurrentStudent() studentId: number,
		@Param('id', ParseIntPipe) eventId: number
	) {
		return this.eventService.viewById(studentId, eventId);
	}
}
