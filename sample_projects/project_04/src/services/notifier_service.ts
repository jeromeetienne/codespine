import type { CreatedOrder } from '../types/domain.js';

/**
 * Outbound order notifications — the project's `ExternalAPI` / `CALLS_EXTERNAL`
 * source (the system-level layer's outbound-HTTP surface).
 *
 * After an order is created, this posts a small summary to an external webhook so
 * downstream systems (fulfilment, analytics) can react. The `fetch` call is gated
 * by the `ORDER_WEBHOOK_ENABLED` config flag (a `ConfigFlag` read), off by default,
 * so the deterministic grading workload never makes a real network call — yet the
 * static call site is always present, so `extract` emits one `ExternalAPI` node for
 * `hooks.example.com` and a `CALLS_EXTERNAL` edge from {@link OrderNotifier.notifyOrderPlaced}.
 */
export class OrderNotifier {
	/** Whether outbound order webhooks are enabled (`ORDER_WEBHOOK_ENABLED=1`). */
	static enabled(): boolean {
		return process.env.ORDER_WEBHOOK_ENABLED === '1';
	}

	/** Post a created-order summary to the external webhook host, when enabled. */
	static async notifyOrderPlaced(order: CreatedOrder): Promise<void> {
		if (OrderNotifier.enabled() === false) {
			return;
		}
		await fetch('https://hooks.example.com/orders', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(order),
		});
	}
}
