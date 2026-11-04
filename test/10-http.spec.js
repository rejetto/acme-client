/**
 * HTTP client tests
 */

const { randomUUID: uuid } = require('crypto');
const http = require('http');
const { assert } = require('chai');
const nock = require('nock');
const axios = require('./../src/axios');
const HttpClient = require('./../src/http');
const pkg = require('./../package.json');

describe('http', () => {
    let testClient;

    const endpoint = `http://${uuid()}.example.com`;
    const defaultUserAgent = `node-${pkg.name}/${pkg.version}`;
    const customUserAgent = 'custom-ua-123';

    afterEach(() => {
        nock.cleanAll();
    });

    /**
     * Initialize
     */

    it('should initialize clients', () => {
        testClient = new HttpClient();
    });

    /**
     * HTTP verbs
     */

    it('should http get', async () => {
        nock(endpoint).get('/').reply(200, 'ok');
        const resp = await testClient.request(endpoint, 'get');

        assert.isObject(resp);
        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.data, 'ok');
    });

    it('should follow redirects', async () => {
        nock(endpoint).get('/first').reply(302, '', { Location: '/second' });
        nock(endpoint).get('/second').reply(200, 'ok');
        const resp = await testClient.request(`${endpoint}/first`, 'get');

        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.data, 'ok');
    });

    it('should preserve the timeout error used by HFS', async () => {
        nock(endpoint).get('/slow').delayConnection(50).reply(200, 'ok');

        await assert.isRejected(axios.get(`${endpoint}/slow`, { timeout: 10 }), /Timeout/);
    });

    it('should reject truncated responses', async () => {
        const { retryMaxAttempts } = axios.defaults.acmeSettings;
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Length': 100 });
            res.write('partial');
            const { socket } = res;
            setTimeout(() => socket.destroy(), 10);
        });
        await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
        axios.defaults.acmeSettings.retryMaxAttempts = 0;

        try {
            const { port } = server.address();
            await assert.isRejected(axios.get(`http://127.0.0.1:${port}`), /aborted/i);
        }
        finally {
            axios.defaults.acmeSettings.retryMaxAttempts = retryMaxAttempts;
            await new Promise((resolve) => { server.close(resolve); });
        }
    });

    it('should use a custom transport', async () => {
        let request;
        const transport = async (config) => {
            request = config;
            return { status: 200, headers: {}, data: 'custom' };
        };
        const client = new HttpClient(undefined, undefined, {}, transport);
        const response = await client.request(endpoint, 'get');

        assert.strictEqual(request.url, endpoint);
        assert.strictEqual(response.data, 'custom');
    });

    /**
     * User-Agent
     */

    it('should request using default user-agent', async () => {
        nock(endpoint).matchHeader('user-agent', defaultUserAgent).get('/').reply(200, 'ok');
        axios.defaults.headers.common['User-Agent'] = defaultUserAgent;
        const resp = await testClient.request(endpoint, 'get');

        assert.isObject(resp);
        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.data, 'ok');
    });

    it('should reject using custom user-agent', async () => {
        nock(endpoint).matchHeader('user-agent', defaultUserAgent).get('/').reply(200, 'ok');
        axios.defaults.headers.common['User-Agent'] = customUserAgent;
        await assert.isRejected(testClient.request(endpoint, 'get'));
    });

    it('should request using custom user-agent', async () => {
        nock(endpoint).matchHeader('user-agent', customUserAgent).get('/').reply(200, 'ok');
        axios.defaults.headers.common['User-Agent'] = customUserAgent;
        const resp = await testClient.request(endpoint, 'get');

        assert.isObject(resp);
        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.data, 'ok');
    });

    it('should reject using default user-agent', async () => {
        nock(endpoint).matchHeader('user-agent', customUserAgent).get('/').reply(200, 'ok');
        axios.defaults.headers.common['User-Agent'] = defaultUserAgent;
        await assert.isRejected(testClient.request(endpoint, 'get'));
    });

    /**
     * Retry on HTTP errors
     */

    it('should retry on 429 rate limit', async () => {
        let rateLimitCount = 0;

        nock(endpoint).persist().get('/').reply(() => {
            rateLimitCount += 1;

            if (rateLimitCount < 3) {
                return [429, 'Rate Limit Exceeded', { 'Retry-After': 1 }];
            }

            return [200, 'ok'];
        });

        assert.strictEqual(rateLimitCount, 0);
        const resp = await testClient.request(endpoint, 'get');

        assert.isObject(resp);
        assert.strictEqual(resp.status, 200);
        assert.strictEqual(resp.data, 'ok');
        assert.strictEqual(rateLimitCount, 3);
    });

    it('should retry on 5xx server error', async () => {
        let serverErrorCount = 0;

        nock(endpoint).persist().get('/').reply(() => {
            serverErrorCount += 1;
            return [500, 'Internal Server Error', { 'Retry-After': 1 }];
        });

        assert.strictEqual(serverErrorCount, 0);
        const resp = await testClient.request(endpoint, 'get');

        assert.isObject(resp);
        assert.strictEqual(resp.status, 500);
        assert.strictEqual(serverErrorCount, 4);
    });
});
