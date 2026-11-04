const { assert } = require('chai');
const acme = require('./../src');

describe('client-hfs', () => {
    it('should pass requests through the configured transport', async () => {
        const requests = [];
        const client = new acme.Client({
            accountKey: Buffer.from('unused'),
            directoryUrl: 'https://acme.example/directory',
            async transport(request) {
                requests.push(request);
                return {
                    status: 200,
                    headers: {},
                    data: { meta: { termsOfService: 'https://acme.example/terms' } },
                };
            },
        });

        assert.strictEqual(await client.getTermsOfServiceUrl(), 'https://acme.example/terms');
        assert.strictEqual(requests.length, 1);
        assert.strictEqual(requests[0].url, 'https://acme.example/directory');
    });
});
