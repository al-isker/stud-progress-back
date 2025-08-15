import * as crypto from 'crypto-js';
import { PASSWORD_CRYPTO_SECRET_KEY } from 'src/common/lib/env/env-keys';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordService {
	constructor(private configService: ConfigService) {}

	private passwordCryptoSecret() {
		return this.configService.get<string>(PASSWORD_CRYPTO_SECRET_KEY);
	}

	encrypt(password: string) {
		const passwordCipher = crypto.AES.encrypt(
			password,
			this.passwordCryptoSecret()
		);

		return passwordCipher.toString();
	}

	decrypt(encryptedPassword: string) {
		const passwordWordArray = crypto.AES.decrypt(
			encryptedPassword,
			this.passwordCryptoSecret()
		);

		return passwordWordArray.toString(crypto.enc.Utf8);
	}
}
