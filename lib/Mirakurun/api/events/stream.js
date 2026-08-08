"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = void 0;
const Event_1 = __importDefault(require("../../Event"));
const get = (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(200);
    res.write("[\n");
    req.setTimeout(1000 * 60 * 60);
    req.once("close", () => Event_1.default.removeListener(_listener));
    Event_1.default.onEvent(_listener);
    function _listener(message) {
        if (req.query.resource && req.query.resource !== message.resource) {
            return;
        }
        if (req.query.type && req.query.type !== message.type) {
            return;
        }
        res.write(JSON.stringify(message) + "\n,\n");
    }
};
exports.get = get;
exports.get.apiDoc = {
    tags: ["events", "stream"],
    operationId: "getEventsStream",
    parameters: [
        {
            in: "query",
            name: "resource",
            type: "string",
            enum: ["program", "service", "tuner"],
            required: false
        },
        {
            in: "query",
            name: "type",
            type: "string",
            enum: ["create", "update", "remove"],
            required: false
        }
    ],
    responses: {
        200: {
            description: "OK",
            schema: {
                type: "array",
                items: {
                    $ref: "#/definitions/Event"
                }
            }
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
//# sourceMappingURL=stream.js.map