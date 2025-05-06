import { Module } from '@nestjs/common';
import { DgmuHelperService } from './dgmu-helper.service';
import { DgmuService } from './dgmu.service';

@Module({
  providers: [DgmuService, DgmuHelperService],
  exports: [DgmuService]
})
export class DgmuModule {}
