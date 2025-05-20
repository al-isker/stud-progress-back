import { Module } from '@nestjs/common';
import { DgmuRouterService } from './dgmu-router.service';
import { DgmuService } from './dgmu.service';

@Module({
	providers: [DgmuService, DgmuRouterService],
	exports: [DgmuService]
})
export class DgmuModule {}
