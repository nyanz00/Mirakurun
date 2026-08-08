"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.put = void 0;
const child_process_1 = require("child_process");
const api = __importStar(require("../api"));
const put = (req, res) => {
    if (process.env.pm_uptime) {
        const cmd = (0, child_process_1.spawn)("mirakurun", ["restart"], {
            detached: true,
            stdio: "ignore"
        });
        cmd.unref();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.status(202);
        res.end(JSON.stringify({ _cmd_pid: cmd.pid }));
    }
    else if (process.env.DOCKER === "YES") {
        res.status(202);
        res.end(JSON.stringify({ _exit: 0 }));
        setTimeout(() => process.kill(parseInt(process.env.INIT_PID, 10), 1), 0);
    }
    else {
        api.responseError(res, 500);
    }
};
exports.put = put;
exports.put.apiDoc = {
    tags: ["misc"],
    summary: "Restart Mirakurun",
    operationId: "restart",
    produces: [
        "application/json"
    ],
    responses: {
        202: {
            description: "Accepted"
        },
        default: {
            description: "Unexpected Error",
            schema: {
                $ref: "#/definitions/Error"
            }
        }
    }
};
//# sourceMappingURL=restart.js.map