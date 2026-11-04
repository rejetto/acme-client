/**
 * Crypto operations needed by HFS' RSA HTTP-01 and DNS-01 ACME flows.
 */

const crypto = require('crypto');
const forge = require('./forge');

exports.createPrivateKey = forge.createPrivateKey;
exports.createPrivateRsaKey = forge.createPrivateKey;
exports.createCsr = forge.createCsr;
exports.splitPemChain = forge.splitPemChain;

exports.getPublicKey = (keyPem) => Buffer.from(crypto.createPublicKey(keyPem).export({
    type: 'pkcs1',
    format: 'pem',
}));

exports.getJwk = (keyPem) => {
    const jwk = crypto.createPublicKey(keyPem).export({ format: 'jwk' });
    return Object.keys(jwk).sort().reduce((result, key) => {
        result[key] = jwk[key];
        return result;
    }, {});
};

exports.getPemBodyAsB64u = (pem) => Buffer
    .from(forge.getPemBody(pem), 'base64')
    .toString('base64url');

exports.readCsrDomains = forge.readCsrDomains;
exports.readCertificateInfo = (certPem) => {
    const cert = new crypto.X509Certificate(certPem);
    const legacy = cert.toLegacyObject();
    const altNames = (legacy.subjectaltname || '')
        .split(', ')
        .map((entry) => entry.replace(/^(DNS|IP Address):/, ''))
        .filter(Boolean);

    return {
        issuer: { commonName: legacy.issuer.CN || null },
        domains: {
            commonName: legacy.subject.CN || null,
            altNames,
        },
        notAfter: new Date(cert.validTo),
        notBefore: new Date(cert.validFrom),
    };
};
