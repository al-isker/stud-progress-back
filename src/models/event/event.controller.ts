import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentStudent } from '../student/decorators/current-student.decorator';
import { EventService } from './event.service';

@Controller('event')
export class EventController {
	constructor(private readonly eventService: EventService) {}

	@Get('count-news')
	@Auth()
	getCountNews(@CurrentStudent() studentId: number) {
		return this.eventService.getCountNews(studentId);
	}
}
