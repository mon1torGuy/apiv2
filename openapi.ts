export const openapiSchema = {
	openapi: '3.0.0',
	info: {
		title: 'TypeAuth API',
		version: '1.0.0',
		description: 'API documentation for TypeAuth',
		'x-logo': {
			url: 'https://developers.userzero.io/typeauth-light.png',
			backgroundColor: '#FFFFFF',
			altText: 'typeauth logo',
		},
	},
	servers: [
		{
			url: 'https://api.typeauth.com',
		},
	],

	tags: [
		{
			name: 'Applications',
			description: 'Endpoints related to applications',
		},
		{
			name: 'Keys',
			description: 'Endpoints related to keys',
		},
		{
			name: 'JWTs',
			description: 'Endpoints related to JWTs',
		},
		{
			name: 'Monitors',
			description: 'Endpoints related to monitors',
		},
		{
			name: 'Feedback',
			description: 'Provide Feedback',
		},
	],
	paths: {
		'/{accId}/applications/create': {
			post: {
				tags: ['Applications'],
				operationId: 'createApplication',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'Create a new application',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/RequestApplicationSchema',
							},
						},
					},
				},
				responses: {
					'201': {
						description: 'Application created successfully',
					},
					'400': {
						description: 'Invalid request body or application name already exists',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications': {
			get: {
				tags: ['Applications'],
				operationId: 'getApplications',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'List all applications',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'No applications found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{id}': {
			get: {
				tags: ['Applications'],
				operationId: 'getApplicationbyID',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'Retrieve an application by ID',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'Application not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			put: {
				tags: ['Applications'],
				operationId: 'updateApplication',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'Update an application',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									name: {
										type: 'string',
									},
									description: {
										type: 'string',
									},
									prefix: {
										type: 'string',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Successful response',
					},
					'400': {
						description: 'Invalid JSON syntax',
					},
					'404': {
						description: 'Account or application not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			delete: {
				tags: ['Applications'],
				operationId: 'deleteApplication',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'Delete an application',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Application deleted successfully',
					},
					'404': {
						description: 'Account or application not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/keys': {
			get: {
				tags: ['Keys'],
				operationId: 'getKeys',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'List all keys',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys': {
			get: {
				tags: ['Keys'],
				operationId: 'getKeysbyApplication',
				security: [
					{
						bearerAuth: [],
					},
				],
				summary: 'Retrieve keys by appId',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'Application not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			post: {
				tags: ['Keys'],
				summary: 'Create a key',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/RequestKeySchema',
							},
						},
					},
				},
				responses: {
					'201': {
						description: 'Key created successfully',
					},
					'400': {
						description: 'Invalid request body',
					},
					'404': {
						description: 'Application or account not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/authenticate': {
			post: {
				tags: ['Keys'],
				summary: 'Verify authentication key',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									token: {
										type: 'string',
									},
									appId: {
										type: 'string',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Successful response',
					},
					'400': {
						description: 'Key is required',
					},
					'403': {
						description: 'Key is disabled or has expired',
					},
					'429': {
						description: 'Rate limit exceeded',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys/{keyId}/verify': {
			get: {
				tags: ['Keys'],
				summary: 'Verify a key',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Key is valid',
					},
					'403': {
						description: 'Key is disabled or has expired',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys/{keyId}': {
			get: {
				tags: ['Keys'],
				summary: 'Retrieve a key by ID',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			post: {
				tags: ['Keys'],
				summary: 'Update a key',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									value: {
										type: 'string',
									},
									environment: {
										type: 'string',
									},
									expires: {
										type: 'integer',
									},
									metadata: {
										type: 'object',
									},
									ratelimit: {
										type: 'object',
									},
									refill: {
										type: 'object',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Successful response',
					},
					'400': {
						description: 'Invalid JSON syntax',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys/{keyId}/refill': {
			put: {
				tags: ['Keys'],
				summary: "Update a key's remaining limit",
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									refill: {
										type: 'integer',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Successful response',
					},
					'400': {
						description: 'Invalid JSON syntax',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys/{keyId}/delete': {
			delete: {
				tags: ['Keys'],
				summary: 'Delete a key',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Key deleted successfully',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/keys/{keyId}/usage': {
			get: {
				tags: ['Keys'],
				summary: 'Retrieve usage numbers',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'keyId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'Key not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/applications/{appId}/analytics': {
			get: {
				tags: ['Keys'],
				summary: 'Retrieve analytics',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'appId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/jwts': {
			get: {
				tags: ['JWTs'],
				summary: 'List JWTs',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'No JWTs found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			delete: {
				tags: ['JWTs'],
				summary: 'Delete JWT',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'query',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'JWT deleted successfully',
					},
					'404': {
						description: 'JWT not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/jwts/create': {
			post: {
				tags: ['JWTs'],
				summary: 'Create JWT',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/RequestJWKCreateSchema',
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'JWKs added successfully',
					},
					'400': {
						description: 'Invalid request body',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/{accId}/monitors': {
			post: {
				tags: ['Monitors'],
				summary: 'Create a monitor',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/RequestMonitorDashSchema',
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Monitor created successfully',
					},
					'400': {
						description: 'Invalid request body',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			get: {
				tags: ['Monitors'],
				summary: 'Get monitors',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'query',
						required: false,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Successful response',
					},
					'404': {
						description: 'Monitors not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			put: {
				tags: ['Monitors'],
				summary: 'Update monitor',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'query',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								$ref: '#/components/schemas/RequestMonitorUpdateSchema',
							},
						},
					},
				},
				responses: {
					'200': {
						description: 'Successful response',
					},
					'400': {
						description: 'Invalid request body',
					},
					'404': {
						description: 'Monitor not found',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			delete: {
				tags: ['Monitors'],
				summary: 'Delete monitor',
				parameters: [
					{
						name: 'accId',
						in: 'path',
						required: true,
						schema: {
							type: 'string',
						},
					},
					{
						name: 'id',
						in: 'query',
						required: true,
						schema: {
							type: 'string',
						},
					},
				],
				responses: {
					'200': {
						description: 'Monitor deleted successfully',
					},
					'401': {
						description: 'Query parameters missing',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
		'/dashboard/feedback': {
			get: {
				tags: ['Feedback'],
				summary: 'Get feedback',
				responses: {
					'200': {
						description: 'Successful response',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
			post: {
				tags: ['Feedback'],
				summary: 'Create feedback',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									name: {
										type: 'string',
									},
									description: {
										type: 'string',
									},
								},
							},
						},
					},
				},
				responses: {
					'201': {
						description: 'Feedback created successfully',
					},
					'400': {
						description: 'Invalid JSON syntax',
					},
					'500': {
						description: 'Internal server error',
					},
				},
			},
		},
	},
	components: {
		securitySchemes: {
			bearerAuth: {
				bearerFormat: 'account typeauth key',
				type: 'http',
				scheme: 'bearer',
			},
		},
		schemas: {
			RequestApplicationSchema: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
					},
					ratelimit: {
						type: 'object',
					},
					refill: {
						type: 'object',
					},
					remaining: {
						type: 'integer',
					},
					keyType: {
						type: 'string',
					},
					jwk: {
						type: 'string',
					},
					expires: {
						type: 'integer',
					},
					byteLength: {
						type: 'integer',
					},
					description: {
						type: 'string',
					},
					prefix: {
						type: 'string',
					},
				},
			},
			RequestKeySchema: {
				type: 'object',
				properties: {
					byteLength: {
						type: 'integer',
					},
					expires: {
						type: 'integer',
					},
					metadata: {
						type: 'object',
					},
					remaining: {
						type: 'integer',
					},
					ratelimit: {
						type: 'object',
					},
					refill: {
						type: 'object',
					},
				},
			},
			RequestJWKCreateSchema: {
				type: 'object',
				properties: {
					type: {
						type: 'string',
					},
					jsonKey: {
						type: 'object',
						properties: {
							keys: {
								type: 'array',
								items: {
									$ref: '#/components/schemas/JWKsType',
								},
							},
						},
					},
					jwtEndpoint: {
						type: 'string',
					},
				},
			},
			JWKsType: {
				type: 'object',
				properties: {
					kty: {
						type: 'string',
					},
					use: {
						type: 'string',
					},
					crv: {
						type: 'string',
					},
					kid: {
						type: 'string',
					},
					x: {
						type: 'string',
					},
					y: {
						type: 'string',
					},
					alg: {
						type: 'string',
					},
				},
			},
			RequestMonitorDashSchema: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
					},
					url: {
						type: 'string',
					},
					status_code: {
						type: 'integer',
					},
				},
			},
			RequestMonitorUpdateSchema: {
				type: 'object',
				properties: {
					name: {
						type: 'string',
					},
					url: {
						type: 'string',
					},
					mon_status: {
						type: 'boolean',
					},
					status_code: {
						type: 'integer',
					},
				},
			},
		},
	},
};
