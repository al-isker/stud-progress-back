import * as admin from 'firebase-admin';
import {
	FIREBASE_CLIENT_EMAIL_KEY,
	FIREBASE_PRIVATE_KEY_KEY,
	FIREBASE_PROJECT_ID_KEY
} from 'src/common/lib/env/env-keys';

export const firebaseAdmin = admin.initializeApp({
	credential: admin.credential.cert({
		projectId: process.env[FIREBASE_PROJECT_ID_KEY],
		clientEmail: process.env[FIREBASE_CLIENT_EMAIL_KEY],
		privateKey: process.env[FIREBASE_PRIVATE_KEY_KEY]
	})
});
