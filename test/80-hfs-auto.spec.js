const { randomUUID } = require('crypto');
const { assert } = require('chai');
const acme = require('./../src');
const cts = require('./challtestsrv');

describe('HFS ACME flow', () => {
    const domainName = process.env.ACME_DOMAIN_NAME || 'example.com';
    const directoryUrl = process.env.ACME_DIRECTORY_URL || acme.directory.letsencrypt.staging;

    before(function () {
        if (!cts.isEnabled()) this.skip();
    });

    [['http-01', false], ['dns-01', true]].forEach(([challenge, wildcard]) => {
        it(`should issue an RSA certificate using ${challenge}`, async () => {
            const domain = `${randomUUID()}.${domainName}`;
            const altNames = [wildcard ? `*.${domain}` : domain];
            const [certificateName] = altNames;
            const kid = process.env.ACME_EAB_KID;
            const hmacKey = process.env.ACME_EAB_HMAC_KEY;
            const accountKey = await acme.crypto.createPrivateKey();
            const [, csr] = await acme.crypto.createCsr({ altNames });
            const client = new acme.Client({
                accountKey,
                directoryUrl,
                externalAccountBinding: kid && hmacKey ? { kid, hmacKey } : undefined,
                backoffAttempts: 5,
                backoffMin: 1000,
                backoffMax: 5000,
            });
            const certificate = await client.auto({
                csr,
                challengePriority: [challenge],
                challengeCreateFn: challenge === 'http-01'
                    ? cts.assertHttpChallengeCreateFn
                    : cts.assertDnsChallengeCreateFn,
                challengeRemoveFn: cts.challengeRemoveFn,
                skipChallengeVerification: true,
                termsOfServiceAgreed: true,
            });

            assert.include(certificate.toString(), 'BEGIN CERTIFICATE');
            assert.include(acme.crypto.readCertificateInfo(certificate).domains.altNames, certificateName);
        });
    });
});
