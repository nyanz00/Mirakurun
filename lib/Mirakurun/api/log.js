"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const log_1 = require("../log");
const get = (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    const logs = log_1.event.logs;
    const len = logs.length;
    for (let i = 0; i < len; i++) {
        res.write(logs[i] + "\n");
    }
    res.end();
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["log"],
    operationId: "getLog",
    produces: ["text/plain"],
    responses: {
        200: {
            description: "OK"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};
//# sourceMappingURL=log.js.map