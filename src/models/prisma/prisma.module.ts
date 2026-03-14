import { Global, Module } from '@nestjs/common';
import { PrismaTransactionService } from './prisma-transaction.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
	providers: [PrismaService, PrismaTransactionService],
	exports: [PrismaService, PrismaTransactionService]
})
export class PrismaModule {}
