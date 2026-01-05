import Expo, { ExpoPushMessage, ExpoPushToken } from 'expo-server-sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ExpoService {
	private expoClient = new Expo({
		useFcmV1: true
	});

	async sendPushNotification(
		expoPushToken: ExpoPushToken | undefined,
		payload: Omit<ExpoPushMessage, 'to'>
	) {
		if (expoPushToken) {
			const [chunk] = this.expoClient.chunkPushNotifications([
				{ to: expoPushToken, ...payload }
			]);

			await this.expoClient.sendPushNotificationsAsync(chunk);
		}
	}
}
