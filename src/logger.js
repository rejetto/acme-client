/**
 * ACME logger
 */

let logger = () => {};

/**
 * Set logger function
 *
 * @param {function} fn Logger function
 */

exports.setLogger = (fn) => {
    logger = fn;
};

/**
 * Log message
 *
 * @param {string} msg Message
 */

exports.log = (msg) => {
    logger(msg);
};
