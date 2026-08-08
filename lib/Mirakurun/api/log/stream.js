"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const log_1 = require("../../log");
const get = (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200);
    req.setTimeout(1000 * 60 * 60);
    req.once("close", () => {
        log_1.event.removeListener("data", _listener);
    });
    log_1.event.on("data", _listener);
    function _listener(data) {
        res.write(data + "\n");
    }
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["log", "stream"],
    operationId: "getLogStream",
    responses: {
        200: {
            description: "OK"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};
//# sourceMappingURL=stream.js.map