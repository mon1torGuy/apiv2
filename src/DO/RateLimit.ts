interface Env {
	typeauth_keys: KVNamespace;
	account_keys: KVNamespace;
	app_jwt_keys: KVNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	MONITOR: AnalyticsEngineDataset;
	AUDIT: AnalyticsEngineDataset;
	MASTER_API_TOKEN: string;
}
interface KeyDetails {
	rl: {
		limit: number;
		timeWindow: number;
	};
}

export class RateLimit implements DurableObject {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const { searchParams } = new URL(request.url);
		const key = searchParams.get('key');
		const init = searchParams.get('init');
		const set = searchParams.get('set');

		if (!key) {
			return new Response(JSON.stringify({ error: 'Key is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (init) {
			await this.state.storage.put(key, set);
			return new Response(JSON.stringify(set), {
				status: 201,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		// Retrieve the key details from storage or database
		const keyDetails = await this.getKeyDetails(key);

		if (!keyDetails) {
			return new Response(JSON.stringify({ error: 'Invalid key' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const { limit, timeWindow } = keyDetails.rl;

		const now = Date.now() / 1000; // Current timestamp in seconds

		const storageValue = await this.state.storage.get<{ value: number; expiration: number }>(key);
		let value = storageValue?.value || 0;
		let expiration = storageValue?.expiration || now + timeWindow;

		if (now < expiration) {
			if (value >= limit) {
				return new Response(JSON.stringify({ error: 'Rate limit exceeded', remaining: 0 }), {
					status: 429,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			value++;
		} else {
			value = 1;
			expiration = now + timeWindow;
		}

		await this.state.storage.put(key, { value, expiration });

		const remaining = limit - value;

		return new Response(JSON.stringify({ remaining }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async getKeyDetails(key: string): Promise<KeyDetails | null> {
		const keyDetailsJson = await this.env.typeauth_keys.getWithMetadata(key);
		if (keyDetailsJson.metadata) {
			return keyDetailsJson.metadata as KeyDetails;
		}
		return null;
	}
}
