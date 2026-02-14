import {
	MOBILE_APP_LINK_TO_APP_STORE,
	MOBILE_APP_LINK_TO_GOOGLE_PLAY,
	MOBILE_APP_MIN_SUPPORTED_VERSION
} from 'src/common/lib/env/env-keys';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MobileAppInfoService {
	constructor(private configService: ConfigService) {}

	private info = {
		minSupportedVersion: this.configService.get<string>(
			MOBILE_APP_MIN_SUPPORTED_VERSION
		),
		linkToGooglePlay: this.configService.get<string>(
			MOBILE_APP_LINK_TO_GOOGLE_PLAY
		),
		linkToAppStore: this.configService.get<string>(MOBILE_APP_LINK_TO_APP_STORE)
	};

	async get() {
		return this.info;
	}
}
