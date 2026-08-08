"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseError = responseError;
exports.responseStreamErrorHandler = responseStreamErrorHandler;
exports.responseJSON = responseJSON;
function responseError(res, code, reason) {
    if (reason) {
        res.writeHead(code, reason, {
            "Content-Type": "application/json"
        });
    }
    else {
        res.writeHead(code, {
            "Content-Type": "application/json"
        });
    }
    const error = {
        code: code,
        reason: reason || null,
        errors: []
    };
    res.end(JSON.stringify(error));
    return res;
}
function responseStreamErrorHandler(res, err) {
    if (err.message === "no available tuners") {
        return responseError(res, 503, "Tuner Resource Unavailable");
    }
    return responseError(res, 500, err.message);
}
async function responseJSON(res, body) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200);
    res.end(JSON.stringify(body));
    return res;
}
//# sourceMappingURL=api.js.map