interface Env {
	typeauth_keys: KVNamespace;
	account_keys: KVNamespace;
	app_jwt_keys: KVNamespace;
	ANALYTICS: AnalyticsEngineDataset;
	MONITOR: AnalyticsEngineDataset;
	AUDIT: AnalyticsEngineDataset;
	MASTER_API_TOKEN: string;
}

interface KeyDetailsRemaining {
	remaining: number;
}

interface KeyDetails {
	rl: {
		limit: number;
		timeWindow: number;
	};
}



export class Remain implements DurableObject {
	private state: DurableObjectState;
	private env: Env;

	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
	}

	async fetch(request: Request): Promise<Response> {
		const { searchParams } = new URL(request.url);
		const key = searchParams.get('key');
		const set = searchParams.get('set');
		const init = searchParams.get('init');
		const get = searchParams.get('get');
		if (!key) {
			return new Response(JSON.stringify({ error: 'Key is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (get) {
			let remaining = await this.state.storage.get(key);
			return new Response(JSON.stringify({ remaining: remaining }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (init) {
			if (!set) {
				return new Response(JSON.stringify({ error: 'set is missing' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			await this.state.storage.put(key, parseInt(set));
			return new Response(JSON.stringify({ remaining: set }), {
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

		let remaining = await this.state.storage.get<number>(key);

		if (remaining === undefined) {
			return new Response(JSON.stringify({ error: 'Invalid key' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (remaining <= 0) {
			return new Response(JSON.stringify({ error: 'Usage limit exceeded', remaining: 0 }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		await this.state.storage.put(key, remaining - 1);

		return new Response(JSON.stringify({ remaining: remaining - 1 }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	async getKeyDetails(key: string): Promise<KeyDetailsRemaining | null> {
		const keyDetailsJson = await this.env.typeauth_keys.get(key);
		if (keyDetailsJson) {
			return JSON.parse(keyDetailsJson) as KeyDetailsRemaining;
		}
		return null;
	}
}
