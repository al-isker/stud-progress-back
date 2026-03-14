import { PrismaClient } from '@prisma/client';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
	constructor() {
		super({
			transactionOptions: {
				timeout: 300000
			}
		});
	}

	async onModuleInit() {
		await this.$connect();
	}
}
