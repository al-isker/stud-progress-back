import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { StudentModule } from './student/student.module';

@Module({
  imports: [StudentModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}
