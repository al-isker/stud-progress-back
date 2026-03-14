import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaTransactionService {
	constructor(private prisma: PrismaService) {}

	anyway<T>(
		fn: (tx: Prisma.TransactionClient) => Promise<T>,
		tx: Prisma.TransactionClient | undefined,
		options?: Prisma.PrismaClientOptions['transactionOptions']
	) {
		return tx ? fn(tx) : this.prisma.$transaction(fn, options);
	}
}
