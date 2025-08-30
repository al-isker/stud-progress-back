import * as fs from 'fs';
import { NestApplicationOptions } from '@nestjs/common';

export const httpsOptions: NestApplicationOptions['httpsOptions'] = {
	key: fs.readFileSync('./private.key'),
	cert: fs.readFileSync('./certificate.crt')
};
