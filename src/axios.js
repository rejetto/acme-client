/**
 * Minimal Axios-compatible surface used by acme-client.
 */

const http = require('http');
const https = require('https');
const { parseRetryAfterHeader } = require('./util');
const { log } = require('./logger');
const pkg = require('./../package.json');

const defaults = {
    headers: { common: { 'User-Agent': `node-${pkg.name}/${pkg.version}` } },
    acmeSettings: {
        httpChallengePort: 80,
        httpsChallengePort: 443,
        retryMaxAttempts: 5,
        retryDefaultDelay: 5,
    },
};

function requestOnce(config, redirects = 0) {
    return new Promise((resolve, reject) => {
        const url = new URL(config.url);
        const transport = url.protocol === 'https:' ? https : http;
        const headers = { ...defaults.headers.common, ...config.headers };
        const body = config.data === undefined ? null : Buffer.from(
            typeof config.data === 'string' || Buffer.isBuffer(config.data)
                ? config.data
                : JSON.stringify(config.data),
        );

        if (body && !('Content-Length' in headers)) {
            headers['Content-Length'] = body.length;
        }

        const req = transport.request(url, {
            method: (config.method || 'get').toUpperCase(),
            headers,
            agent: url.protocol === 'https:' ? config.httpsAgent : config.httpAgent,
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                if (redirects >= 5) {
                    reject(new Error('Too many redirects'));
                }
                else {
                    resolve(requestOnce({ ...config, url: new URL(res.headers.location, url).href }, redirects + 1));
                }
                return;
            }

            const chunks = [];
            res.once('aborted', () => reject(Object.assign(new Error('Response aborted'), { code: 'ECONNRESET' })));
            res.once('error', reject);
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString();
                const contentType = res.headers['content-type'] || '';
                let data = text;

                if (text && /(^|\/)json($|;)|\+json($|;)/i.test(contentType)) {
                    try {
                        data = JSON.parse(text);
                    }
                    catch (error) {
                        // Axios also leaves malformed JSON as text by default
                    }
                }

                resolve({
                    data,
                    status: res.statusCode,
                    headers: res.headers,
                    config,
                    request: req,
                });
            });
        });

        req.on('error', reject);
        if (config.timeout) {
            req.setTimeout(config.timeout, () => {
                const error = new Error(`Timeout of ${config.timeout}ms exceeded`);
                error.code = 'ECONNABORTED';
                req.destroy(error);
            });
        }
        if (body) req.write(body);
        req.end();
    });
}

async function waitToRetry(url, attempt, code, retryAfterHeader) {
    const parsedDelay = parseRetryAfterHeader(retryAfterHeader);
    const delay = parsedDelay || defaults.acmeSettings.retryDefaultDelay * attempt;
    log(`Caught ${code}, retry attempt ${attempt}/${defaults.acmeSettings.retryMaxAttempts} to URL ${url}`);
    await new Promise((resolve) => { setTimeout(resolve, delay * 1000); });
}

async function request(config, transport = requestOnce, retryAttempt = 0) {
    let response;

    try {
        response = await transport(config);
    }
    catch (error) {
        const noMoreRetries = retryAttempt >= defaults.acmeSettings.retryMaxAttempts;
        if (noMoreRetries || error.code === 'ECONNABORTED' || error.code === 'ERR_NOCK_NO_MATCH') {
            throw error;
        }
        await waitToRetry(config.url, retryAttempt + 1, error.code);
        return request(config, transport, retryAttempt + 1);
    }

    const retryableStatus = response.status === 429 || (response.status >= 500 && response.status <= 599);
    if (retryableStatus && retryAttempt < defaults.acmeSettings.retryMaxAttempts) {
        await waitToRetry(config.url, retryAttempt + 1, `HTTP ${response.status}`, response.headers['retry-after']);
        return request(config, transport, retryAttempt + 1);
    }

    const validateStatus = config.validateStatus === undefined
        ? (status) => status >= 200 && status < 300
        : config.validateStatus;

    if (validateStatus && !validateStatus(response.status)) {
        const error = new Error(`Request failed with status code ${response.status}`);
        error.response = response;
        throw error;
    }
    return response;
}

module.exports = {
    defaults,
    request,
    get: (url, config = {}) => request({ ...config, url, method: 'get' }),
};
