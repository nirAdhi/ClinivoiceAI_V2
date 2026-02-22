const isDev = process.env.NODE_ENV !== 'production';

const logger = {
    info: (...args) => {
        if (isDev) console.log(...args);
    },
    error: (...args) => {
        console.error(...args);
    },
    warn: (...args) => {
        if (isDev) console.warn(...args);
    },
    debug: (...args) => {
        if (isDev) console.log(...args);
    },
    success: (...args) => {
        if (isDev) console.log('✅', ...args);
    }
};

module.exports = logger;
