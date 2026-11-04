const { assert } = require('chai');
const crypto = require('./../src/crypto');

describe('crypto-hfs', () => {
    it('should create the RSA account key used by HFS', async () => {
        const key = await crypto.createPrivateKey();
        const jwk = crypto.getJwk(key);

        assert.strictEqual(jwk.kty, 'RSA');
        assert.isNotEmpty(jwk.e);
        assert.isNotEmpty(jwk.n);
    });

    it('should create DNS, wildcard and IP certificate requests', async () => {
        const altNames = ['example.com', '*.example.com', '192.0.2.1'];
        const [, csr] = await crypto.createCsr({ altNames });

        assert.deepEqual(crypto.readCsrDomains(csr).altNames, altNames);
    });
});
