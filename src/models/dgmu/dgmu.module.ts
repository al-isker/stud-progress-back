import { Module } from '@nestjs/common';
import { DgmuService } from './dgmu.service';

@Module({
  providers: [DgmuService],
  exports: [DgmuService]
})
export class DgmuModule {}
