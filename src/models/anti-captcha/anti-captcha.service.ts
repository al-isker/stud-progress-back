import * as Tesseract from 'tesseract.js';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

@Injectable()
export class AntiCaptchaService implements OnModuleInit, OnModuleDestroy {
	private tesseractWorker: Tesseract.Worker;

	async onModuleInit() {
		this.tesseractWorker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
			errorHandler: () => {}
		});

		await this.tesseractWorker.setParameters({
			tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
			tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
			load_system_dawg: 0,
			load_freq_dawg: 0,
			load_unambig_dawg: 0,
			load_punc_dawg: 0,
			load_number_dawg: 0,
			load_bigram_dawg: 0,
			tessedit_enable_dict_correction: 0
		});
	}

	async recognizeText(image: Tesseract.ImageLike) {
		const { data } = await this.tesseractWorker.recognize(image);

		return data.text.trim();
	}

	async onModuleDestroy() {
		await this.tesseractWorker.terminate();
	}
}
