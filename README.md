# @rejetto/acme-client

Small ACME client derived from [`acme-client` 5.4.0](https://github.com/publishlab/node-acme-client), tailored to the certificate flows used by HFS.

It keeps:

- RSA account keys and certificate signing requests;
- HTTP-01 and DNS-01 challenges, including wildcard certificates;
- IP subject alternative names and custom order payloads such as Let's Encrypt's `shortlived` profile;
- retry handling, redirects, external account binding and preferred certificate chains.

It deliberately omits the ECDSA CSR and TLS-ALPN-01 implementations. HFS does not expose those flows. This removes Axios, `@peculiar/x509` and ASN.1 dependencies; the only runtime dependency is `node-forge`, which HFS already uses.

Requires Node.js 19.6 or later.

## Usage

The API used by HFS is unchanged apart from the package name:

```js
const acme = require('@rejetto/acme-client');

const accountKey = await acme.crypto.createPrivateKey();
const [certificateKey, csr] = await acme.crypto.createCsr({
    altNames: ['example.com', '*.example.com'],
});

const client = new acme.Client({
    accountKey,
    directoryUrl: acme.directory.letsencrypt.production,
});

const certificate = await client.auto({
    csr,
    termsOfServiceAgreed: true,
    challengePriority: ['dns-01'],
    challengeCreateFn: async () => {},
    challengeRemoveFn: async () => {},
});
```

## License

MIT. Copyright and license terms from the upstream project are retained in [LICENSE](LICENSE).
