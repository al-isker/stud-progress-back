import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentModule } from '../student/student.module';
import { EventController } from './event.controller';
import { EventService } from './event.service';

@Module({
	imports: [StudentModule],
	controllers: [EventController],
	providers: [EventService, PrismaService]
})
export class EventModule {}
