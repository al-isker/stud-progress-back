import { BaseMessage } from 'firebase-admin/lib/messaging/messaging-api';
import { firebaseAdmin } from 'src/common/lib/firebase-admin';
import { Injectable } from '@nestjs/common';

@Injectable()
export class FcmService {
	async sendPushNotification(token: string, payload: BaseMessage) {
		await firebaseAdmin.messaging().send({
			token,
			...payload
		});
	}
}
