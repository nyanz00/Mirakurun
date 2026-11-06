/*
   Copyright 2016 kanreisa

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
import {Operation} from "express-openapi";
import * as api from "../../../../api";
import * as apid from "../../../../../../api";
import { channelTypes } from "../../../../common";
import _ from "../../../../_";
import remoteManager from "../../../../remote/RemoteManager";

export const parameters = [
    {
        in: "path",
        name: "type",
        type: "string",
        enum: channelTypes,
        required: true
    },
    {
        in: "path",
        name: "channel",
        type: "string",
        required: true
    },
    {
        in: "header",
        name: "X-Mirakurun-Priority",
        type: "integer",
        minimum: 0
    },
    {
        in: "query",
        name: "decode",
        type: "integer",
        minimum: 0,
        maximum: 1
    }
];

export const get: Operation = (req, res) => {
    const channel = _.channel.get(req.params.type as apid.ChannelType, req.params.channel);

    if (channel === null) {
        api.responseError(res, 404);
        return;
    }

    const userId = (req.ip || "unix") + ":" + (req.socket.remotePort || Date.now());

    // HEAD request support
    if (req.method === "HEAD") {
        res.setHeader("Content-Type", "video/MP2T");
        res.setHeader("X-Mirakurun-Tuner-User-ID", userId);
        res.status(200).end();
        return;
    }

    let priority = parseInt(req.get("X-Mirakurun-Priority"), 10) || 0;
    const remoteId = req.get("X-Mirakurun-Remote-ID");
    const tracked = remoteManager.beginIncoming(remoteId, req.ip, value => { priority = value; }, `${req.params.type}/${req.params.channel}`);
    if (tracked) {
        const write = res.write;
        let updated = 0;
        res.write = function (...args: any[]) {
            if (res.statusCode === 200 && args[0]?.length && Date.now() - updated >= 1000) {
                updated = Date.now();
                remoteManager.incomingData(remoteId);
            }
            return write.apply(this, args);
        };
        res.once("close", () => remoteManager.incomingStage(remoteId, "closed"));
    }

    let requestAborted = false;
    req.once("close", () => requestAborted = true);

    (<any> res.socket)._writableState.highWaterMark = Math.max(res.writableHighWaterMark, 1024 * 1024 * 16);
    res.socket.setNoDelay(true);

    channel.getStream({
        id: userId,
        get priority() { return priority; },
        agent: req.get("User-Agent"),
        url: req.url,
        disableDecoder: (parseInt(req.query.decode as string, 10) === 0)
    }, res)
        .then(tsFilter => {
            if (tracked) {
                remoteManager.incomingStage(remoteId, "allocated");
            }
            if (requestAborted === true || req.aborted === true) {
                return tsFilter.close();
            }

            req.once("close", () => tsFilter.close());

            res.setHeader("Content-Type", "video/MP2T");
            res.setHeader("X-Mirakurun-Tuner-User-ID", userId);
            res.status(200);
        })
        .catch((err) => {
            if (tracked) {
                remoteManager.incomingStage(remoteId, "failed", err.message !== "no available tuners");
            }
            api.responseStreamErrorHandler(res, err);
        });
};

get.apiDoc = {
    tags: ["channels", "stream"],
    operationId: "getChannelStream",
    produces: ["video/MP2T"],
    responses: {
        200: {
            description: "OK",
            headers: {
                "X-Mirakurun-Tuner-User-ID": {
                    type: "string"
                }
            }
        },
        404: {
            description: "Not Found"
        },
        503: {
            description: "Tuner Resource Unavailable"
        },
        default: {
            description: "Unexpected Error"
        }
    }
};

// HEAD request support
export const head: Operation = (...args) => get(...args);

head.apiDoc = {
    ...get.apiDoc,
    operationId: undefined
};
