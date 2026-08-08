"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const regexp = {
    unixDomainSocket: /^\/.+/,
    windowsNamedPipe: /^\\\\\.\\pipe\\.+/i
};
exports.default = regexp;
//# sourceMappingURL=regexp.js.map