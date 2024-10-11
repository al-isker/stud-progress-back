import { Module } from '@nestjs/common';
import { DgmuModule } from 'src/models/dgmu/dgmu.module';
import { PrismaService } from 'src/prisma.service';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';

@Module({
  imports: [DgmuModule],
  controllers: [SubjectController],
  providers: [SubjectService, PrismaService],
})
export class SubjectModule {}
