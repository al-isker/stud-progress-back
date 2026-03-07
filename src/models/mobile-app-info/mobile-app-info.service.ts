import {
	MOBILE_APP_LINK_TO_APP_STORE_KEY,
	MOBILE_APP_LINK_TO_GOOGLE_PLAY_KEY,
	MOBILE_APP_MIN_SUPPORTED_VERSION_KEY
} from 'src/common/lib/env/env-keys';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MobileAppInfoService {
	constructor(private configService: ConfigService) {}

	private info = {
		minSupportedVersion: this.configService.get<string>(MOBILE_APP_MIN_SUPPORTED_VERSION_KEY),
		linkToGooglePlay: this.configService.get<string>(MOBILE_APP_LINK_TO_GOOGLE_PLAY_KEY),
		linkToAppStore: this.configService.get<string>(MOBILE_APP_LINK_TO_APP_STORE_KEY)
	};

	async get() {
		return this.info;
	}
}
