/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import { Operation } from "express-openapi";
import * as api from "../../api";
import manager from "../../remote/RemoteManager";

export const post: Operation = async (req, res) => {
    try {
        const message = await manager.recover(req.ip, req.body.ids);
        return api.responseJSON(res, { accepted: true, message });
    } catch (error) {
        return api.responseJSON(res, { accepted: false, message: error.message });
    }
};
post.apiDoc = {
    tags: ["remote"], operationId: "recoverRemote",
    parameters: [{ in: "body", name: "body", required: true, schema: {
        type: "object", required: ["ids"], properties: {
            ids: { type: "array", minItems: 3, maxItems: 3, uniqueItems: true, items: { type: "string", maxLength: 36 } }
        }
    } }],
    responses: { 200: { description: "Recovery decision", schema: { type: "object" } } }
};
