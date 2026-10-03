# Push-уведомления

## Отправка из транзакции

Транзакция может откатиться — отправленный push уже нет. Поэтому внутри транзакции уведомления не отправляются, они собираются в массив колбэков, которые вызывает потребитель после завершения транзакции.

Транзакция собирает колбэки в массив и возвращает их напрямую или полем объекта:

```ts
async doWork() {
	return await this.prisma.$transaction(async tx => {
		const notificationCallbacks = Array<() => void>();

		if (changed) {
			await tx.entity.update(...);

			notificationCallbacks.push(() => {
				this.pushNotificationService.send(...);
			});
		}

		return { notificationCallbacks };
	});
}
```

Колбэки вызывает конечный потребитель — после того как транзакция завершилась:

```ts
const { notificationCallbacks } = await this.service.doWork();

for (const notificationCallback of notificationCallbacks) {
	notificationCallback();
}
```

Потребитель вправе колбэки не вызывать — тогда уведомления не уйдут.
